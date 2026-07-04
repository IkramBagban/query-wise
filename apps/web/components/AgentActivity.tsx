"use client";

import { ChevronRight } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

/* ------------------------------- Model ---------------------------------- */

/** Normalized step consumed by the timeline, from either live events or the persisted transcript. */
export type TimelineStep =
  | { kind: "thinking"; content: string; live?: boolean }
  | { kind: "tool"; tool: string; input?: unknown; status: "pending" | "ok" | "error"; summary: string };

/** Raw live-activity element accumulated in StreamState.activities. */
export interface StreamActivity {
  kind: string;
  label?: string;
  tool?: string;
  blockIndex?: number | null;
  content?: string;
  input?: unknown;
  callId?: string;
}

/** Internal tools that must never surface to the user. */
const HIDDEN_TOOLS = new Set(["set_chart"]);

const TOOL_LABELS: Record<string, string> = {
  run_sql: "Ran SQL query",
  describe_tables: "Explored schema",
  sample_values: "Sampled values",
};

const TOOL_PENDING_LABELS: Record<string, string> = {
  run_sql: "Running SQL query",
  describe_tables: "Exploring schema",
  sample_values: "Sampling values",
};

/* ------------------------------ Adapters -------------------------------- */

/** Live SSE activities → ordered timeline steps (tool-call/result already merged upstream). */
export function activitiesToSteps(
  activities: StreamActivity[],
  opts?: { streaming?: boolean },
): TimelineStep[] {
  const steps: TimelineStep[] = [];
  let lastThinking = -1;
  for (const activity of activities) {
    if (activity.kind === "thinking") {
      if (!activity.content?.trim()) continue;
      lastThinking = steps.length;
      steps.push({ kind: "thinking", content: activity.content });
    } else if (["tool-call", "tool-result", "retry"].includes(activity.kind)) {
      if (HIDDEN_TOOLS.has(activity.tool ?? "")) continue;
      steps.push({
        kind: "tool",
        tool: activity.tool ?? "",
        input: activity.input,
        status: activity.kind === "retry" ? "error" : activity.kind === "tool-result" ? "ok" : "pending",
        summary: activity.label ?? "",
      });
    }
  }
  // Mark the trailing thinking block as live while it is still the newest thing on screen.
  if (opts?.streaming && lastThinking === steps.length - 1 && steps[lastThinking]?.kind === "thinking") {
    steps[lastThinking] = { ...steps[lastThinking], live: true } as TimelineStep;
  }
  return steps;
}

/** Persisted message metadata → ordered timeline steps. */
export function parseAgentTranscript(metadata: unknown): TimelineStep[] {
  const transcript = (metadata as { agentV3?: { transcript?: unknown } } | null)?.agentV3?.transcript;
  if (!Array.isArray(transcript)) return [];
  return transcript.flatMap((raw): TimelineStep[] => {
    if (!raw || typeof raw !== "object") return [];
    const { tool, outcome, summary, input } = raw as {
      tool?: string;
      outcome?: string;
      summary?: string;
      input?: unknown;
    };
    if (typeof tool !== "string" || typeof summary !== "string") return [];
    if (tool === "thinking") return summary.trim() ? [{ kind: "thinking", content: summary }] : [];
    if (HIDDEN_TOOLS.has(tool)) return [];
    return [{ kind: "tool", tool, input, status: outcome === "error" ? "error" : "ok", summary }];
  });
}

/* ---------------------------- Bouncing Dots ----------------------------- */

/** A minimal three-dot typing indicator. */
export function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1 rounded-full bg-accent"
          style={{ animation: "agent-bounce 1.2s ease-in-out infinite", animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <style>{`@keyframes agent-bounce {
        0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
        30% { opacity: 1; transform: translateY(-2.5px); }
      }`}</style>
    </span>
  );
}

/* ------------------------------ Timeline -------------------------------- */

type Tone = "accent" | "success" | "danger" | "pending";

const DOT_CLASS: Record<Tone, string> = {
  accent: "bg-accent-2/50",
  success: "bg-success/80",
  danger: "bg-danger",
  pending: "bg-accent",
};

/**
 * Shared row: a slim rail with a status dot on the left, expandable content on
 * the right. Deliberately icon-free — the dot carries the status, the text
 * carries the meaning.
 */
function TimelineRow({
  tone,
  isLast,
  children,
}: {
  tone: Tone;
  isLast: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-2.5">
      <span className="relative flex w-3 shrink-0 justify-center" aria-hidden>
        {!isLast && <span className="absolute bottom-0 top-[18px] w-px bg-border/60" />}
        <span className="relative mt-[9px] flex size-1.5">
          {tone === "pending" && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          )}
          <span className={`relative inline-flex size-1.5 rounded-full ${DOT_CLASS[tone]}`} />
        </span>
      </span>
      <div className="min-w-0 flex-1 pb-1.5">{children}</div>
    </div>
  );
}

/** Trailing tail of the live thought, so the timeline feels alive without dumping raw reasoning. */
function liveTail(content: string): string {
  const compact = content.replaceAll(/\s+/g, " ").trim();
  return compact.length > 90 ? `…${compact.slice(-90)}` : compact;
}

function ThinkingRow({ step, isLast }: { step: Extract<TimelineStep, { kind: "thinking" }>; isLast: boolean }) {
  return (
    <TimelineRow isLast={isLast} tone={step.live ? "pending" : "accent"}>
      <details className="group">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 py-0.5 text-xs text-text-3 transition hover:text-text-2">
          <span className="font-medium">{step.live ? "Thinking" : "Thought process"}</span>
          {step.live ? <BouncingDots /> : null}
          {step.live ? (
            <span className="min-w-0 truncate text-[11px] text-text-3/70">{liveTail(step.content)}</span>
          ) : null}
          <ChevronRight className="size-3 shrink-0 text-text-3/60 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mb-1 mt-1.5 border-l-2 border-border/70 pl-3 text-[12.5px] leading-relaxed text-text-3">
          <Markdown>{step.content}</Markdown>
        </div>
      </details>
    </TimelineRow>
  );
}

function ToolRow({ step, isLast }: { step: Extract<TimelineStep, { kind: "tool" }>; isLast: boolean }) {
  const isError = step.status === "error";
  const isPending = step.status === "pending";
  const label = isPending
    ? TOOL_PENDING_LABELS[step.tool] ?? step.tool
    : TOOL_LABELS[step.tool] ?? step.tool;

  let sql: string | null = null;
  let inputJson: string | null = null;
  if (step.input && typeof step.input === "object") {
    if ("sql" in step.input && typeof (step.input as { sql?: unknown }).sql === "string") {
      sql = (step.input as { sql: string }).sql;
    } else {
      inputJson = JSON.stringify(step.input, null, 2);
    }
  }
  const expandable = Boolean(sql || inputJson);
  const tone: Tone = isError ? "danger" : isPending ? "pending" : "success";

  const summaryLine = (
    <>
      <span className={`font-medium ${isError ? "text-danger" : "text-text-2"}`}>{label}</span>
      {isPending ? <BouncingDots /> : null}
      {step.summary && (
        <span className={`min-w-0 truncate text-[11px] ${isError ? "text-danger/75" : "text-text-3"}`}>
          {step.summary}
        </span>
      )}
    </>
  );

  return (
    <TimelineRow isLast={isLast} tone={tone}>
      {expandable ? (
        <details className="group">
          <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 py-0.5 text-xs">
            {summaryLine}
            <ChevronRight className="size-3 shrink-0 text-text-3/60 transition-transform group-open:rotate-90" />
          </summary>
          <div className="mb-1 mt-1.5 space-y-2 border-l-2 border-border/70 pl-3">
            {sql && (
              <div className="overflow-x-auto rounded-lg bg-surface-2/80 text-[12px]">
                <Markdown>{"```sql\n" + sql + "\n```"}</Markdown>
              </div>
            )}
            {inputJson && (
              <div className="overflow-x-auto rounded-lg bg-surface-2/80 text-[12px]">
                <Markdown>{"```json\n" + inputJson + "\n```"}</Markdown>
              </div>
            )}
            {step.summary && (
              <p className={`text-[12px] ${isError ? "text-danger" : "text-text-3"}`}>{step.summary}</p>
            )}
          </div>
        </details>
      ) : (
        <p className="flex items-center gap-1.5 py-0.5 text-xs">{summaryLine}</p>
      )}
    </TimelineRow>
  );
}

/** Unified ordered feed of the agent's reasoning and tool activity. */
export function AgentTimeline({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-col">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return step.kind === "thinking" ? (
          <ThinkingRow key={idx} step={step} isLast={isLast} />
        ) : (
          <ToolRow key={idx} step={step} isLast={isLast} />
        );
      })}
    </div>
  );
}

/** Finalized steps rendered from persisted message metadata. */
export function AgentSteps({ metadata }: { metadata: unknown }) {
  return <AgentTimeline steps={parseAgentTranscript(metadata)} />;
}
