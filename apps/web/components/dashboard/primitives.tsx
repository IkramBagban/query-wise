"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Snowflake, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DATE_RANGE_PRESETS,
  DATE_RANGE_PRESET_LABELS,
} from "@/lib/dashboards/date-range";
import type { DashboardDateRange, DateRangePreset, WidgetMode } from "@query-wise/shared/types";

/* ------------------------------ Freshness label --------------------------- */

export function relativeTime(iso: string | null): string {
  if (!iso) return "not yet refreshed";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * SPEC-06 §8b: freshness is ambient — a quiet relative timestamp that updates
 * itself once a minute without a loud spinner.
 */
export function FreshnessLabel({ lastRefreshedAt }: { lastRefreshedAt: string | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="text-faint">Updated {relativeTime(lastRefreshedAt)}</span>;
}

/* ------------------------------ Count-up number --------------------------- */

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/**
 * SPEC-06 §8b: a number that changed counts up/down from the old value over 450ms
 * (rAF, tabular-nums) and gets a one-shot green-up / amber-down tint. Reduced
 * motion snaps to the final value with no tint.
 */
export function CountUpNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const [tint, setTint] = useState<"up" | "down" | null>(null);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    if (reduce) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    setTint(value > from ? "up" : "down");
    const start = performance.now();
    const duration = 450;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    const clear = window.setTimeout(() => setTint(null), 820);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(clear);
    };
  }, [value, reduce]);

  return (
    <span
      className={cn(
        "tabular-nums",
        tint === "up" && "qw-tint-up",
        tint === "down" && "qw-tint-down",
        className,
      )}
    >
      {numberFormat.format(Math.round(display))}
    </span>
  );
}

/* ------------------------------ Mode badge -------------------------------- */

/**
 * A read-only status pill shown wherever a dashboard is listed. Live breathes (a
 * concentric ping); Snapshot reads as crisply frozen. `prefers-reduced-motion`
 * stills the ping via Tailwind's motion-safe guard.
 */
export function ModeBadge({ mode, className }: { mode: WidgetMode; className?: string }) {
  if (mode === "live") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-strong",
          className,
        )}
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
        </span>
        Live
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-faint",
        className,
      )}
    >
      <Snowflake className="size-2.5" strokeWidth={2.25} />
      Snapshot
    </span>
  );
}

/* ------------------------------ Mode toggle ------------------------------- */

/**
 * Whole-dashboard execution mode. Live re-runs widgets; Snapshot freezes them.
 */
export function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: WidgetMode;
  onChange: (next: WidgetMode) => void;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const options: Array<{ key: WidgetMode; label: string; icon: typeof Zap }> = [
    { key: "live", label: "Live", icon: Zap },
    { key: "snapshot", label: "Snapshot", icon: Snowflake },
  ];
  return (
    <div
      role="tablist"
      aria-label="Dashboard mode"
      className="inline-flex items-center gap-1"
    >
      {options.map((option) => {
        const isActive = option.key === value;
        const Icon = option.icon;
        return (
          <button
            key={option.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 px-1 py-1.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
              isActive ? "text-accent-strong" : "text-muted hover:text-text",
            )}
          >
            <Icon className="size-3.5" strokeWidth={isActive ? 2.25 : 1.8} />
            {option.label}
            {isActive ? <motion.span layoutId="dashboard-mode-indicator" aria-hidden className="absolute inset-x-1 bottom-0 h-px bg-accent" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Date-range picker ------------------------- */

function presetOf(range: DashboardDateRange | null): DateRangePreset | "all" {
  if (!range) return "all";
  if ("preset" in range) return range.preset;
  return "all";
}

/**
 * SPEC-06 §8b / SPEC-04 §2.9: a segmented control with a sliding active pill
 * (`motion.span layoutId="range-pill"`). Changing it drives the refresh wave.
 */
export function DateRangePicker({
  value,
  onChange,
  disabled,
}: {
  value: DashboardDateRange | null;
  onChange: (next: DashboardDateRange | null) => void;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const active = presetOf(value);
  const options: Array<{ key: DateRangePreset | "all"; label: string }> = [
    { key: "all", label: "All" },
    ...DATE_RANGE_PRESETS.map((preset) => ({ key: preset, label: DATE_RANGE_PRESET_LABELS[preset] })),
  ];

  return (
    <div
      role="tablist"
      aria-label="Date range"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-2/60 p-0.5"
    >
      {options.map((option) => {
        const isActive = option.key === active;
        return (
          <button
            key={option.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key === "all" ? null : { preset: option.key })}
            className={cn(
              "relative rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.04em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
              isActive ? "text-accent-strong" : "text-muted hover:text-text",
            )}
          >
            {isActive ? (
              <motion.span
                layoutId="range-pill"
                aria-hidden
                className="absolute inset-0 -z-10 rounded-md bg-accent-soft border border-accent-line/20 shadow-sm"
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
