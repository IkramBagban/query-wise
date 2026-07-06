"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Markdown } from "@/components/ui/markdown";

/* ------------------------------- Model ---------------------------------- */

/** Normalized step consumed by the timeline, from either live events or the persisted transcript. */
export type TimelineStep =
  | { kind: "thinking"; content: string; live?: boolean }
  | { kind: "tool"; tool: string; input?: unknown; status: "pending" | "ok" | "error"; summary: string; blockIndex?: number | null };

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
        blockIndex: activity.blockIndex,
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

  // Count successful run_sql steps so we can fallback-assign blockIndex for
  // old messages that don't have it persisted.
  let successfulRunSqlCount = 0;

  return transcript.flatMap((raw): TimelineStep[] => {
    if (!raw || typeof raw !== "object") return [];
    const { tool, outcome, summary, input, blockIndex: persistedBlockIndex } = raw as {
      tool?: string;
      outcome?: string;
      summary?: string;
      input?: unknown;
      blockIndex?: number;
    };
    if (typeof tool !== "string" || typeof summary !== "string") return [];
    if (tool === "thinking") return summary.trim() ? [{ kind: "thinking", content: summary }] : [];
    if (HIDDEN_TOOLS.has(tool)) return [];

    // Determine blockIndex: use persisted value if available, otherwise for
    // successful run_sql steps, fallback to sequential assignment (the n-th
    // successful query → block index n). This keeps old conversations working.
    let resolvedBlockIndex: number | undefined;
    if (tool === "run_sql" && outcome === "ok") {
      resolvedBlockIndex = typeof persistedBlockIndex === "number" ? persistedBlockIndex : successfulRunSqlCount;
      successfulRunSqlCount++;
    }

    return [{
      kind: "tool",
      tool,
      input,
      status: outcome === "error" ? "error" : "ok",
      summary,
      blockIndex: resolvedBlockIndex,
    }];
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
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="relative flex gap-2.5"
    >
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
    </motion.div>
  );
}

function SmoothDetails({ summary, children, open, onToggle }: { summary: React.ReactNode, children: React.ReactNode, open?: boolean, onToggle?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(open ?? false);
  useEffect(() => {
    if (open !== undefined) setInternalOpen(open);
  }, [open]);
  const isOpen = internalOpen;
  return (
    <div className="group" data-state={isOpen ? "open" : "closed"}>
      <div 
        className="flex cursor-pointer select-none items-center py-0.5"
        onClick={() => {
           setInternalOpen(!isOpen);
           onToggle?.(!isOpen);
        }}
      >
        {summary}
      </div>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
           {children}
        </div>
      </div>
    </div>
  )
}

function ThinkingRow({ step, isLast }: { step: Extract<TimelineStep, { kind: "thinking" }>; isLast: boolean }) {
  const [isOpen, setIsOpen] = useState(!!step.live);

  useEffect(() => {
    setIsOpen(!!step.live);
  }, [step.live]);

  return (
    <TimelineRow isLast={isLast} tone={step.live ? "pending" : "accent"}>
      <SmoothDetails 
        open={isOpen} 
        onToggle={setIsOpen}
        summary={
          <div className="flex w-full items-center gap-1.5 text-xs text-faint hover:text-muted">
            <span className="font-medium">{step.live ? "Thinking" : "Thought process"}</span>
            {step.live ? <BouncingDots /> : null}
            <ChevronRight className="size-3 shrink-0 text-faint/60 transition-transform group-data-[state=open]:rotate-90" />
          </div>
        }
      >
        <div className="relative mb-1 mt-1.5 border-l-2 border-border/70 pl-3 text-[12.5px] leading-relaxed text-faint">
          <Markdown>{step.content}</Markdown>
          {step.live && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-surface to-transparent" />
          )}
        </div>
      </SmoothDetails>
    </TimelineRow>
  );
}

function ToolRow({
  step,
  isLast,
}: {
  step: Extract<TimelineStep, { kind: "tool" }>;
  isLast: boolean;
}) {
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
      <span className={`font-medium ${isError ? "text-danger" : "text-muted"}`}>{label}</span>
      {isPending ? <BouncingDots /> : null}
      {step.summary && (
        <span className={`min-w-0 truncate text-[11px] ${isError ? "text-danger/75" : "text-faint"}`}>
          {step.summary}
        </span>
      )}
    </>
  );

  return (
    <TimelineRow isLast={isLast} tone={tone}>
      {expandable ? (
        <SmoothDetails
          summary={
            <div className="flex w-full items-center gap-1.5 text-xs">
              {summaryLine}
              <ChevronRight className="size-3 shrink-0 text-faint/60 transition-transform group-data-[state=open]:rotate-90" />
            </div>
          }
        >
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
              <p className={`text-[12px] ${isError ? "text-danger" : "text-faint"}`}>{step.summary}</p>
            )}
          </div>
        </SmoothDetails>
      ) : (
        <p className="flex items-center gap-1.5 py-0.5 text-xs">{summaryLine}</p>
      )}
    </TimelineRow>
  );
}

/**
 * Unified ordered feed of the agent's reasoning and tool activity.
 *
 * When `renderBlock` is provided, each result card is rendered full-width
 * directly after the `run_sql` row that produced it — chronological, but the
 * card sits OUTSIDE the timeline rail (not indented under the vertical line)
 * so charts get the full width and don't look clipped onto the rail.
 */
export function AgentTimeline({
  steps,
  renderBlock,
}: {
  steps: TimelineStep[];
  /** Called to render a result block card after the matching tool row. */
  renderBlock?: (blockIndex: number) => React.ReactNode;
}) {
  if (steps.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-col">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        if (step.kind === "thinking") {
          return <ThinkingRow key={idx} step={step} isLast={isLast} />;
        }
        const card =
          renderBlock && step.tool === "run_sql" && step.status === "ok" && step.blockIndex != null
            ? renderBlock(step.blockIndex)
            : null;

        // A row with a card ends the rail segment (isLast) so the vertical line
        // stops cleanly above the full-width card instead of running through it.
        return (
          <div key={idx} className="flex flex-col">
            <ToolRow step={step} isLast={isLast || Boolean(card)} />
            {card ? <div className="mb-4 mt-1.5">{card}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Finalized steps rendered from persisted message metadata. */
export function AgentSteps({
  metadata,
  renderBlock,
}: {
  metadata: unknown;
  renderBlock?: (blockIndex: number) => React.ReactNode;
}) {
  return <AgentTimeline steps={parseAgentTranscript(metadata)} renderBlock={renderBlock} />;
}

export function AgentStatusHeartbeat({ status }: { status: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 100);
    return () => clearInterval(interval);
  }, [status]);

  const showElapsed = elapsed > 3000;
  
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="text-accent animate-pulse"
        >
          {status}
        </motion.span>
      </AnimatePresence>
      {showElapsed ? (
        <span className="tabular-nums text-faint">
          · {(elapsed / 1000).toFixed(1)}s
        </span>
      ) : null}
    </div>
  );
}
