"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Database,
  ListTree,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/ui/markdown";

export interface ActivityItem {
  kind: string;
  label: string;
  tool?: string;
  content?: string;
}

export interface TranscriptStep {
  tool: string;
  outcome: "ok" | "error" | "thinking";
  summary: string;
}

function stepIcon(tool: string | undefined, kind?: string) {
  if (kind === "retry") return AlertTriangle;
  if (kind === "thinking") return Sparkles;
  if (tool === "run_sql") return TerminalSquare;
  if (tool === "describe_tables") return ListTree;
  if (tool === "sample_values") return Database;
  if (tool === "set_chart") return BarChart3;
  return Sparkles;
}

const TOOL_LABELS: Record<string, string> = {
  run_sql: "Ran query",
  describe_tables: "Explored schema",
  sample_values: "Sampled values",
  set_chart: "Chose chart",
};

/** Live vertical timeline shown while the agent is working. */
export function ActivityTimeline({ items, live }: { items: ActivityItem[]; live?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="relative flex flex-col gap-0.5">
      {items.map((item, index) => {
        const Icon = stepIcon(item.tool, item.kind);
        const isLast = index === items.length - 1;
        const active = live && isLast;
        return (
          <div key={index} className="relative flex items-start gap-2.5 pb-2 last:pb-0">
            {!isLast ? <span className="absolute left-[11px] top-6 h-full w-px bg-border" aria-hidden /> : null}
            <span
              className={`relative z-10 mt-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border ${
                item.kind === "retry"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : active
                    ? "border-accent-2/50 bg-accent-dim text-accent-2"
                    : "border-border bg-surface-2 text-text-3"
              }`}
            >
              {active ? <Spinner size="sm" className="size-3" /> : <Icon className="size-3" />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              {item.content ? (
                <details className="group">
                  <summary className={`flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium ${active ? "text-text-1" : "text-text-2"} hover:text-text-1 transition-colors`}>
                    {item.label}
                    <ChevronDown className="size-3 text-text-3 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-1.5 rounded-md border border-border bg-surface-2 p-3 text-xs text-text-2 leading-relaxed">
                    <Markdown>{item.content}</Markdown>
                  </div>
                </details>
              ) : (
                <span className={`text-xs ${active ? "text-text-1" : "text-text-3"}`}>
                  {item.label}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Defensive read of the agent transcript persisted in message metadata. */
export function parseAgentTranscript(metadata: unknown): TranscriptStep[] {
  const transcript = (metadata as { agentV3?: { transcript?: unknown } } | null)?.agentV3?.transcript;
  if (!Array.isArray(transcript)) return [];
  return transcript.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const { tool, outcome, summary } = step as Partial<TranscriptStep>;
    if (typeof tool !== "string" || typeof summary !== "string") return [];
    return [{ tool, outcome: outcome as "ok" | "error" | "thinking", summary }];
  });
}

/** Collapsible "how I got this" history on completed assistant messages. */
export function AgentSteps({ metadata }: { metadata: unknown }) {
  const steps = parseAgentTranscript(metadata);
  if (steps.length === 0) return null;
  return (
    <details className="group mt-2 rounded-lg border border-border bg-surface-2/60">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-3 py-1.5 text-[11px] text-text-3 transition hover:text-text-2">
        <Sparkles className="size-3" />
        {steps.length} step{steps.length === 1 ? "" : "s"}
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-3 py-2.5">
        <ActivityTimeline
          items={steps.map((step) => ({
            kind: step.outcome === "error" ? "retry" : step.outcome === "thinking" ? "thinking" : "tool-result",
            tool: step.tool,
            label: step.outcome === "thinking" ? "Thinking" : `${TOOL_LABELS[step.tool] ?? step.tool}`,
            content: step.summary,
          }))}
        />
      </div>
    </details>
  );
}
