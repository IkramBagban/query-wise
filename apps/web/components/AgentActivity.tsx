"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Database,
  ListTree,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
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
  return Sparkles;
}

const TOOL_LABELS: Record<string, string> = {
  run_sql: "Ran SQL query",
  describe_tables: "Explored database schema",
  sample_values: "Sampled data values",
};

/** Internal tools that should never be shown to the user. */
const HIDDEN_TOOLS = new Set(["set_chart"]);

/* -------------------------------- Bouncing Dots -------------------------------- */

/** A minimal three-dot typing indicator. */
export function BouncingDots() {
  return (
    <span className="mt-2 inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-accent"
          style={{
            animation: "agent-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes agent-bounce {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </span>
  );
}

/* -------------------------------- Reasoning -------------------------------- */

/** Render a single reasoning block (Thinking) */
export function ReasoningBlock({ content, live }: { content: string; live?: boolean }) {
  if (!content?.trim()) return null;
  return (
    <details
      className="group mt-2.5 overflow-hidden rounded-xl border border-accent-2/20 bg-gradient-to-b from-accent-2/5 to-transparent"
      open={live}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-accent-2 transition-colors hover:text-accent">
        <Sparkles className="size-3.5" />
        {live ? "Thinking..." : "Thought process"}
        {live && <BouncingDots />}
        <ChevronDown className="ml-auto size-3.5 text-text-3 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-accent-2/10 px-3.5 py-3 text-[13px] leading-relaxed text-text-2">
        <Markdown>{content}</Markdown>
      </div>
    </details>
  );
}

/* -------------------------------- Tool Call -------------------------------- */

/** Render a single tool call block */
export function ToolCallBlock({ step, live }: { step: TranscriptStep; live?: boolean }) {
  if (HIDDEN_TOOLS.has(step.tool)) return null;
  const Icon = step.outcome === "error" ? AlertTriangle : toolIcon(step.tool);
  const label = TOOL_LABELS[step.tool] || step.tool;
  const isError = step.outcome === "error";
  const isDone = step.outcome === "ok";

  let inputDisplay = "";
  if (step.input && typeof step.input === "object") {
    if ("sql" in step.input && typeof step.input.sql === "string") {
      inputDisplay = "```sql\n" + step.input.sql + "\n```";
    } else {
      inputDisplay = "```json\n" + JSON.stringify(step.input, null, 2) + "\n```";
    }
  }

  return (
    <details
      className={`group mt-2 overflow-hidden rounded-xl border transition-colors ${
        isError
          ? "border-danger/25 bg-danger/5"
          : "border-border/60 bg-surface-1 hover:border-border"
      }`}
      open={live}
    >
      <summary
        className={`flex cursor-pointer select-none items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors ${
          isError ? "text-danger" : "text-text-2 hover:text-text-1"
        }`}
      >
        {live && !isDone && !isError ? (
          <span className="relative flex size-3.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-40" />
            <span className="relative inline-flex size-3.5 rounded-full bg-accent" />
          </span>
        ) : isDone ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Icon className="size-3.5" />
        )}
        <span>{label}</span>
        {step.summary && !isError && (
          <span className="truncate max-w-[220px] font-normal text-text-3 hidden sm:inline-block">
            — {step.summary}
          </span>
        )}
        <ChevronDown className="ml-auto size-3.5 text-text-3 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/40 px-3.5 py-3 text-[13px] text-text-2">
        {inputDisplay && (
          <div className="mb-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-3/70">
              Input
            </span>
            <div className="mt-1.5 overflow-x-auto rounded-lg bg-surface-2/80 text-[12px]">
              <Markdown>{inputDisplay}</Markdown>
            </div>
          </div>
        )}
        {step.summary && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-3/70">
              Result
            </span>
            <p className={`mt-1 text-[12px] ${isError ? "text-danger" : "text-text-3"}`}>
              {step.summary}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

/* -------------------------------- Parsing -------------------------------- */

/** Defensive read of the agent transcript persisted in message metadata. */
export function parseAgentTranscript(metadata: unknown): TranscriptStep[] {
  const transcript = (metadata as { agentV3?: { transcript?: unknown } } | null)?.agentV3
    ?.transcript;
  if (!Array.isArray(transcript)) return [];
  return transcript.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const { tool, outcome, summary, input } = step as Partial<TranscriptStep>;
    if (typeof tool !== "string" || typeof summary !== "string") return [];
    return [{ tool, outcome: outcome as "ok" | "error" | "thinking", summary, input }];
  });
}

/* -------------------------------- Finalized Steps -------------------------------- */

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
