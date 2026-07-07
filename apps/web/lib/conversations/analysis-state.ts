import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAppDb } from "@query-wise/shared/app-db";
import { devLog, devLogError } from "@query-wise/shared/observability";
import { generateStructuredObject } from "@/lib/llm/structured";
import { getBackendLlmConfig } from "@/lib/llm/client";
import type { AgentMemoryContext, AgentResultBlock } from "@/lib/llm/agent";

/**
 * SPEC-02 §4 — Structured conversation memory.
 *
 * A small, distilled record persisted on the conversation (`analysis_state`
 * JSONB) that outlives SPEC-01's verbatim-history window. It is refreshed
 * asynchronously AFTER a run completes (fire-and-forget, like
 * `generateAndPersistTitle`) so it never sits on the critical path, and it is
 * injected back into the agent context by `buildMessages` so follow-ups like
 * "now break that down by region" resolve many turns deep.
 *
 * The persisted `analysis_state` column is read/written with raw SQL so this
 * additive field needs no regenerated Prisma client.
 */

const MAX_BLOCK_SUMMARIES = 10;
const MAX_ENTITIES = 20;

export interface ConversationBlockSummary {
  turn: number;
  purpose: string;
  sql: string;
  headline: string;
}

export interface ConversationAnalysisState {
  version: 1;
  turn: number;
  entities?: string[];
  activeFilters?: string[];
  timeWindow?: string;
  blockSummaries?: ConversationBlockSummary[];
  rollingSummary?: string;
}

/** Defensive parse of the persisted JSON — tolerant of absent / legacy shapes. */
export function parseAnalysisState(raw: unknown): ConversationAnalysisState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const turn = typeof value.turn === "number" ? value.turn : 0;
  const stringArray = (input: unknown): string[] | undefined =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : undefined;
  const blockSummaries = Array.isArray(value.blockSummaries)
    ? (value.blockSummaries as unknown[]).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const block = item as Record<string, unknown>;
        if (typeof block.purpose !== "string") return [];
        return [
          {
            turn: typeof block.turn === "number" ? block.turn : 0,
            purpose: block.purpose,
            sql: typeof block.sql === "string" ? block.sql : "",
            headline: typeof block.headline === "string" ? block.headline : "",
          },
        ];
      })
    : undefined;
  return {
    version: 1,
    turn,
    entities: stringArray(value.entities),
    activeFilters: stringArray(value.activeFilters),
    timeWindow: typeof value.timeWindow === "string" ? value.timeWindow : undefined,
    blockSummaries,
    rollingSummary: typeof value.rollingSummary === "string" ? value.rollingSummary : undefined,
  };
}

/** Map persisted memory into the agent's injected context shape (SPEC-02 §4). */
export function toAgentMemoryContext(state: ConversationAnalysisState | undefined): AgentMemoryContext | undefined {
  if (!state) return undefined;
  const blockSummaries = (state.blockSummaries ?? []).map(
    (block) => `turn ${block.turn} · ${block.purpose} — ${block.headline}`,
  );
  const memory: AgentMemoryContext = {
    rollingSummary: state.rollingSummary,
    blockSummaries: blockSummaries.length ? blockSummaries : undefined,
    entities: state.entities?.length ? state.entities : undefined,
    activeFilters: state.activeFilters?.length ? state.activeFilters : undefined,
    timeWindow: state.timeWindow,
  };
  const hasContent =
    memory.rollingSummary ||
    memory.blockSummaries ||
    memory.entities ||
    memory.activeFilters ||
    memory.timeWindow;
  return hasContent ? memory : undefined;
}

/** Load persisted analysis state for a conversation (raw SQL; no client regen needed). */
export async function getConversationAnalysisState(
  conversationId: string,
): Promise<ConversationAnalysisState | undefined> {
  try {
    const rows = await getAppDb().$queryRaw<Array<{ analysis_state: unknown }>>(
      Prisma.sql`SELECT analysis_state FROM v2_conversations WHERE id = ${conversationId}::uuid LIMIT 1`,
    );
    return parseAnalysisState(rows[0]?.analysis_state);
  } catch (error) {
    devLogError("conversation.memory.read-failed", "Failed to read conversation analysis state.", error, { conversationId });
    return undefined;
  }
}

async function persistConversationAnalysisState(
  conversationId: string,
  state: ConversationAnalysisState,
): Promise<void> {
  await getAppDb().$executeRaw(
    Prisma.sql`UPDATE v2_conversations SET analysis_state = ${JSON.stringify(state)}::jsonb WHERE id = ${conversationId}::uuid`,
  );
}

/** Extract referenced table names from a block's SQL (FROM / JOIN clauses). */
function tablesInSql(sql: string): string[] {
  const matches = sql.matchAll(/\b(?:from|join)\s+("?[\w.]+"?)/gi);
  const names = new Set<string>();
  for (const match of matches) {
    const raw = match[1].replaceAll('"', "").trim();
    // Skip obvious subquery/CTE noise.
    if (raw && !raw.includes("(")) names.add(raw);
  }
  return [...names];
}

/** One-sentence, LLM-free headline for a block (SPEC-02 §4). */
function blockHeadline(block: AgentResultBlock): string {
  const rowCount = block.result.returnedRowCount;
  const first = block.result.rows[0];
  let firstHint = "";
  if (first) {
    const pairs = Object.entries(first)
      .slice(0, 3)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
    if (pairs) firstHint = ` (e.g. ${pairs.slice(0, 120)})`;
  }
  return `${rowCount} row${rowCount === 1 ? "" : "s"}${firstHint}`;
}

const memoryUpdateSchema = z.object({
  rollingSummary: z.string().describe("One short paragraph summarizing the conversation so far, for future turns"),
  timeWindow: z.string().describe("The time window currently in effect, e.g. 'Q2 2026' or 'last 30 days'; empty string if none"),
  activeFilters: z.array(z.string()).describe("Filters the user has established, e.g. 'region = EMEA'; empty if none"),
});

const MEMORY_SYSTEM = [
  "You maintain a running memory of a data-analysis conversation.",
  "Given the prior memory and the newest turn, produce an updated one-paragraph rolling summary,",
  "the time window currently in effect, and the active filters. Keep it concise and factual.",
  "Carry forward established filters and windows unless the newest turn changed them.",
].join("\n");

/**
 * Fire-and-forget memory refresh after a run completes (SPEC-02 §4). Computes
 * block summaries and entities deterministically (no LLM), then makes ONE cheap
 * structured call to refresh the rolling summary / window / filters. Never
 * throws — a failed update simply leaves the prior memory in place.
 */
export async function updateConversationMemory(input: {
  conversationId: string;
  question: string;
  answer: string;
  blocks: AgentResultBlock[];
  abortSignal?: AbortSignal;
}): Promise<void> {
  try {
    const prior = await getConversationAnalysisState(input.conversationId);
    const turn = (prior?.turn ?? 0) + 1;

    const newBlockSummaries: ConversationBlockSummary[] = input.blocks.map((block) => ({
      turn,
      purpose: block.purpose,
      sql: block.sql,
      headline: blockHeadline(block),
    }));
    const blockSummaries = [...(prior?.blockSummaries ?? []), ...newBlockSummaries].slice(-MAX_BLOCK_SUMMARIES);

    const entities = [
      ...new Set([...(prior?.entities ?? []), ...input.blocks.flatMap((block) => tablesInSql(block.sql))]),
    ].slice(-MAX_ENTITIES);

    // Cheap LLM refresh of the narrative parts; deterministic parts already done.
    let rollingSummary = prior?.rollingSummary;
    let timeWindow = prior?.timeWindow;
    let activeFilters = prior?.activeFilters;
    try {
      const llmConfig = getBackendLlmConfig();
      const priorContext = [
        prior?.rollingSummary ? `Prior summary: ${prior.rollingSummary}` : "Prior summary: (none)",
        prior?.timeWindow ? `Prior time window: ${prior.timeWindow}` : "",
        prior?.activeFilters?.length ? `Prior filters: ${prior.activeFilters.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const purposes = input.blocks.map((block) => `- ${block.purpose}`).join("\n") || "(no queries)";
      const updated = await generateStructuredObject({
        provider: llmConfig.provider,
        model: llmConfig.model,
        apiKeys: llmConfig.apiKeys,
        schema: memoryUpdateSchema,
        schemaName: "conversation_memory",
        system: MEMORY_SYSTEM,
        prompt: [
          priorContext,
          "",
          `Newest question: ${input.question}`,
          `Newest answer: ${input.answer.slice(0, 1200)}`,
          `Queries run this turn:\n${purposes}`,
        ].join("\n"),
        maxOutputTokens: 500,
        temperature: 0.1,
        abortSignal: input.abortSignal,
      });
      rollingSummary = updated.rollingSummary.trim() || rollingSummary;
      timeWindow = updated.timeWindow.trim() || undefined;
      activeFilters = updated.activeFilters.filter((filter) => filter.trim().length > 0);
    } catch (error) {
      // Narrative refresh is best-effort; deterministic parts still persist.
      devLogError("conversation.memory.summary-failed", "Rolling summary refresh failed; persisting deterministic parts.", error, {
        conversationId: input.conversationId,
      });
    }

    const next: ConversationAnalysisState = {
      version: 1,
      turn,
      entities: entities.length ? entities : undefined,
      activeFilters: activeFilters?.length ? activeFilters : undefined,
      timeWindow: timeWindow || undefined,
      blockSummaries: blockSummaries.length ? blockSummaries : undefined,
      rollingSummary: rollingSummary || undefined,
    };
    await persistConversationAnalysisState(input.conversationId, next);
    devLog("info", "conversation.memory.updated", "Conversation analysis memory updated.", {
      conversationId: input.conversationId,
      turn,
      blockSummaries: next.blockSummaries?.length ?? 0,
      entities: next.entities?.length ?? 0,
    });
  } catch (error) {
    devLogError("conversation.memory.update-failed", "Conversation memory update failed.", error, {
      conversationId: input.conversationId,
    });
  }
}
