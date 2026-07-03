"use client";

import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Database,
  ListTree,
  Sparkles,
  TerminalSquare
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/ui/markdown";

export interface TranscriptStep {
  tool: string;
  input?: unknown;
  outcome: "ok" | "error" | "thinking";
  summary: string;
}

function toolIcon(tool: string | undefined) {
  if (tool === "run_sql") return TerminalSquare;
  if (tool === "describe_tables") return ListTree;
  if (tool === "sample_values") return Database;
  if (tool === "set_chart") return BarChart3;
  return Sparkles;
}

const TOOL_LABELS: Record<string, string> = {
  run_sql: "Ran SQL query",
  describe_tables: "Explored database schema",
  sample_values: "Sampled data values",
};

/** Internal tools that should never be shown to the user. */
const HIDDEN_TOOLS = new Set(["set_chart"]);

/** Render a single reasoning block (Thinking) */
export function ReasoningBlock({ content, live }: { content: string; live?: boolean }) {
  if (!content?.trim()) return null;
  return (
    <details className="group mt-2 rounded-lg border border-border bg-surface-2/60" open={live}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-text-2 transition hover:text-text-1">
        {live ? <Spinner size="sm" className="size-3 text-accent-2" /> : <Sparkles className="size-3 text-accent-2" />}
        {live ? "Thinking..." : "Thought Process"}
        <ChevronDown className="ml-auto size-3 text-text-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-2.5 text-[13px] leading-relaxed text-text-2">
        <Markdown>{content}</Markdown>
        {live && <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-accent-2" />}
      </div>
    </details>
  );
}

/** Render a single tool call block */
export function ToolCallBlock({ step, live }: { step: TranscriptStep; live?: boolean }) {
  if (HIDDEN_TOOLS.has(step.tool)) return null;
  const Icon = step.outcome === "error" ? AlertTriangle : toolIcon(step.tool);
  const label = TOOL_LABELS[step.tool] || step.tool;
  const isError = step.outcome === "error";

  let inputDisplay = "";
  if (step.input && typeof step.input === "object") {
    if ("sql" in step.input && typeof step.input.sql === "string") {
      inputDisplay = "```sql\n" + step.input.sql + "\n```";
    } else {
      inputDisplay = "```json\n" + JSON.stringify(step.input, null, 2) + "\n```";
    }
  }

  return (
    <details className={`group mt-2 rounded-lg border ${isError ? "border-danger/30 bg-danger/5" : "border-border bg-surface-1"}`} open={live}>
      <summary className={`flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium transition ${isError ? "text-danger" : "text-text-2 hover:text-text-1"}`}>
        {live && step.outcome !== "error" && step.outcome !== "ok" ? <Spinner size="sm" className="size-3" /> : <Icon className="size-3" />}
        <span>{label}</span>
        {step.summary && !isError && <span className="text-text-3 font-normal truncate max-w-[200px] hidden sm:inline-block">— {step.summary}</span>}
        <ChevronDown className="ml-auto size-3 text-text-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-3 py-2.5 text-[13px] text-text-2">
        {inputDisplay && (
          <div className="mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Input</span>
            <div className="mt-1">
              <Markdown>{inputDisplay}</Markdown>
            </div>
          </div>
        )}
        {step.summary && (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-3">Result</span>
            <div className={`mt-1 ${isError ? "text-danger" : "text-text-3"}`}>
              {step.summary}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

/** Defensive read of the agent transcript persisted in message metadata. */
export function parseAgentTranscript(metadata: unknown): TranscriptStep[] {
  const transcript = (metadata as { agentV3?: { transcript?: unknown } } | null)?.agentV3?.transcript;
  if (!Array.isArray(transcript)) return [];
  return transcript.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const { tool, outcome, summary, input } = step as Partial<TranscriptStep>;
    if (typeof tool !== "string" || typeof summary !== "string") return [];
    return [{ tool, outcome: outcome as "ok" | "error" | "thinking", summary, input }];
  });
}

/** Render finalized steps (from transcript) */
export function AgentSteps({ metadata }: { metadata: unknown }) {
  const steps = parseAgentTranscript(metadata);
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col">
      {steps.map((step, idx) => {
        if (step.tool === "thinking") {
          return <ReasoningBlock key={idx} content={step.summary} />;
        }
        if (HIDDEN_TOOLS.has(step.tool)) return null;
        return <ToolCallBlock key={idx} step={step} />;
      })}
    </div>
  );
}
