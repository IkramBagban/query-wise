"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUp,
  BarChart3,
  Check,
  Database,
  LayoutDashboard,
  Link2,
  Lock,
  MessageSquareText,
  Plus,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

/**
 * Feature showcase: auto-advancing scenes inside an app frame (sidebar + top
 * bar) so every scene reads as the real product, not a mockup in a void.
 * Advances every 6s, pauses on hover, and any item is clickable.
 */

const ADVANCE_MS = 6000;

interface Feature {
  id: string;
  icon: LucideIcon;
  title: string;
  tag: string;
  crumb: string;
  headline: string;
  line: string;
}

const FEATURES: Feature[] = [
  { id: "chat", icon: MessageSquareText, title: "Chat, not query", tag: "natural language", crumb: "chats / june-revenue", headline: "Ask in plain English.", line: "Follow-ups keep their context." },
  { id: "sql", icon: SquareTerminal, title: "See the SQL", tag: "never a black box", crumb: "chats / june-revenue / query", headline: "Generated, explained, read-only.", line: "Nothing runs you can't inspect." },
  { id: "charts", icon: BarChart3, title: "Charts, automatic", tag: "zero config", crumb: "chats / june-revenue / chart", headline: "The right chart, picked for you.", line: "From the shape of your data." },
  { id: "dashboards", icon: LayoutDashboard, title: "Live dashboards", tag: "pin & refresh", crumb: "dashboards / company-kpis", headline: "Pin answers as widgets.", line: "They refresh themselves." },
  { id: "sharing", icon: Link2, title: "Public sharing", tag: "secure links", crumb: "shared / x7f2 · public", headline: "Share a link, live data.", line: "Password optional. SQL never exposed." },
  { id: "security", icon: ShieldCheck, title: "Safe by default", tag: "passes review", crumb: "settings / security", headline: "Encrypted, read-only, audited.", line: "Credentials never touch the browser." },
  { id: "connections", icon: Database, title: "Every database", tag: "one workspace", crumb: "connections", headline: "Dev, staging, prod.", line: "All in one place, always synced." },
];

/* Which sidebar icon lights up for each scene. */
const SIDEBAR_ICONS: LucideIcon[] = [MessageSquareText, LayoutDashboard, Link2, ShieldCheck, Database];
const SIDEBAR_MAP = [0, 0, 0, 1, 2, 3, 4];

export default function FeaturesJourney() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !inView || reduceMotion) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % FEATURES.length), ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused, inView, active, reduceMotion]);

  const pick = useCallback((i: number) => setActive(i), []);
  const current = FEATURES[active];

  return (
    <section id="features" ref={sectionRef} className="border-t border-border bg-bg px-5 py-20 sm:px-7 sm:py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="max-w-2xl">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Features</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em] text-text">
            From plain English to business insight.
          </h2>
        </div>

        <div
          data-reveal
          className="mt-12 grid items-stretch gap-6 lg:grid-cols-[300px_1fr]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Feature list */}
          <div className="flex snap-x gap-2 overflow-x-auto pb-2 [-webkit-mask-image:linear-gradient(to_right,black_92%,transparent)] [mask-image:linear-gradient(to_right,black_92%,transparent)] lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0 lg:[-webkit-mask-image:none] lg:[mask-image:none]" role="tablist" aria-label="Features">
            {FEATURES.map((feature, i) => {
              const on = i === active;
              const Icon = feature.icon;
              return (
                <button
                  key={feature.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(i)}
                  className={`relative flex shrink-0 snap-start items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-colors duration-200 lg:shrink ${
                    on ? "border-border bg-surface-2" : "border-transparent hover:bg-surface-2/50"
                  }`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] border transition-all duration-200 ${
                      on ? "border-accent bg-accent text-accent-ink shadow-[0_4px_12px_-4px_var(--accent-line)]" : "border-border bg-surface text-muted"
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`whitespace-nowrap text-sm font-semibold transition-colors duration-200 lg:whitespace-normal ${on ? "text-text" : "text-muted"}`}>
                      {feature.title}
                    </span>
                    <span className="whitespace-nowrap text-[11px] leading-tight text-faint lg:whitespace-normal">{feature.tag}</span>
                  </span>
                  <span className={`ml-auto hidden font-mono text-[10px] tabular-nums transition-colors duration-200 lg:block ${on ? "text-accent-strong" : "text-faint/60"}`}>
                    0{i + 1}
                  </span>
                  {/* auto-advance progress rail */}
                  {on && !reduceMotion ? (
                    <span className="absolute inset-x-3.5 bottom-1 hidden h-0.5 overflow-hidden rounded-full bg-border lg:block" aria-hidden>
                      <span
                        key={`${active}-${paused}`}
                        className="block h-full rounded-full bg-accent"
                        style={{ animation: `qw-feature-progress ${ADVANCE_MS}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
                      />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* App frame */}
          <div className="relative flex min-h-[500px] overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow)] sm:min-h-[460px] lg:min-h-[540px] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),var(--shadow)]">
            {/* app sidebar */}
            <div className="hidden w-[52px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-surface-2 py-3.5 sm:flex" aria-hidden>
              <span className="mb-2 flex size-7 items-center justify-center rounded-[9px] bg-accent font-syne text-[13px] font-bold text-accent-ink">Q</span>
              {SIDEBAR_ICONS.map((Icon, i) => {
                const lit = SIDEBAR_MAP[active] === i;
                return (
                  <span
                    key={i}
                    className={`flex size-8 items-center justify-center rounded-lg transition-all duration-300 ${
                      lit ? "bg-accent-soft text-accent-strong" : "text-faint"
                    }`}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                );
              })}
              <span className="mt-auto size-7 rounded-full bg-gradient-to-br from-accent to-accent-strong opacity-80" />
            </div>

            {/* content column */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* top bar */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-2/70 px-4 py-2.5">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={current.crumb}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className="flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] text-faint"
                  >
                    <Lock className="size-3 shrink-0" strokeWidth={1.75} />
                    {current.crumb}
                  </motion.span>
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={current.tag}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0 whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] text-accent-strong"
                  >
                    {current.tag}
                  </motion.span>
                </AnimatePresence>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4 sm:px-7 sm:pb-7 sm:pt-5">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${active}-caption`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="mb-5 text-[15px] leading-normal text-muted"
                  >
                    <b className="font-semibold text-text">{current.headline}</b> {current.line}
                  </motion.p>
                </AnimatePresence>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={active}
                      initial={{ opacity: 0, x: 20, scale: 0.99 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -20, scale: 0.99 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0"
                    >
                      {active === 0 && <ChatScene />}
                      {active === 1 && <SqlScene />}
                      {active === 2 && <ChartScene />}
                      {active === 3 && <DashboardScene />}
                      {active === 4 && <ShareScene />}
                      {active === 5 && <SecurityScene />}
                      {active === 6 && <ConnectionsScene />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const spring = { type: "spring" as const, stiffness: 380, damping: 32 };

/* -------------------------------- Scenes ---------------------------------- */

function ChatScene() {
  const question = "Show me last month's revenue";
  const [typed, setTyped] = useState(0);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    let i = 0;
    const typer = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= question.length) {
        window.clearInterval(typer);
        window.setTimeout(() => setAnswered(true), 550);
      }
    }, 34);
    return () => window.clearInterval(typer);
  }, []);

  const bars = [46, 60, 52, 72, 66, 88];

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="max-w-[85%] self-start rounded-[14px] rounded-bl-md border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted">
          Top seller: <b className="font-semibold text-text">Trail Pack</b> — 4,210 units
        </motion.div>
        <div className="flex min-h-[42px] max-w-[85%] items-center self-end rounded-[14px] rounded-br-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink shadow-[0_6px_18px_-8px_var(--accent-line)]">
          {question.slice(0, typed)}
          {typed < question.length ? <span className="ml-0.5 inline-block h-4 w-0.5 bg-accent-ink/80" style={{ animation: "qw-blink 0.9s step-end infinite" }} /> : null}
        </div>
        <div className="min-h-[168px]">
          {answered ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="max-w-[92%] self-start rounded-[14px] rounded-bl-md border border-border bg-surface-2 p-4">
              <p className="text-sm text-muted">
                Revenue last month was <b className="font-semibold text-text">$84,300</b> — up <b className="font-semibold text-accent-strong">12%</b> on May.
              </p>
              <div className="mt-3 flex h-16 items-end gap-1.5">
                {bars.map((h, i) => (
                  <motion.span
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: 0.15 + i * 0.05, ...spring }}
                    className={`flex-1 rounded-t-[3px] ${i === bars.length - 1 ? "bg-gradient-to-b from-accent-strong to-accent" : "bg-accent/30"}`}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex items-center gap-2 font-mono text-[10px] text-faint">
                <span>6 rows</span>·<span>41 ms</span>·<span className="text-accent-strong">read-only ✓</span>
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>
      {/* composer */}
      <div className="mt-4 flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5">
        <span className="flex-1 text-[13px] text-faint">Ask a follow-up…</span>
        <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-faint">
          <ArrowUp className="size-3.5" strokeWidth={2.25} />
        </span>
      </div>
    </div>
  );
}

const SQL_SCENE_TOKENS: Array<[string, string]> = [
  ["SELECT", "kw"], [" p.name, ", "pl"], ["SUM", "fn"], ["(oi.quantity) ", "pl"], ["AS", "kw"], [" units_sold\n", "pl"],
  ["FROM", "kw"], [" order_items oi\n", "pl"],
  ["JOIN", "kw"], [" products p ", "pl"], ["ON", "kw"], [" p.id = oi.product_id\n", "pl"],
  ["GROUP BY", "kw"], [" ", "pl"], ["1", "num"], [" ", "pl"], ["ORDER BY", "kw"], [" ", "pl"], ["2", "num"], [" ", "pl"], ["DESC", "kw"], [";", "pl"],
];

const TOKEN_CLASS: Record<string, string> = {
  kw: "text-[var(--code-kw)]",
  fn: "text-[var(--code-fn)]",
  num: "text-[var(--code-num)]",
  pl: "text-code-text",
};

/** Split the token stream into lines so we can render a gutter. */
function sqlTokensToLines(tokens: Array<[string, string]>): Array<Array<[string, string]>> {
  const lines: Array<Array<[string, string]>> = [[]];
  for (const [text, kind] of tokens) {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push([part, kind]);
    });
  }
  return lines;
}

const SQL_TOTAL_LINES = sqlTokensToLines(SQL_SCENE_TOKENS).length;
const SQL_CHECKS = ["single statement", "no writes", "row limit 500"];

function SqlScene() {
  const [shown, setShown] = useState(0);
  const done = shown >= SQL_SCENE_TOKENS.length;
  const lines = sqlTokensToLines(SQL_SCENE_TOKENS.slice(0, shown));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShown((current) => {
        if (current >= SQL_SCENE_TOKENS.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 55);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-4">
      <div className="overflow-hidden rounded-[14px] border border-border bg-code-bg">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <span className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] text-faint">
            <span
              className={`size-1.5 shrink-0 rounded-full transition-colors duration-300 ${done ? "bg-accent" : "bg-warning"}`}
              style={!done ? { animation: "qw-pulse 1s ease-in-out infinite" } : undefined}
            />
            <span className="truncate">query.sql</span>
          </span>
          {done ? (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[10.5px] text-accent-strong" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
              ✓ read-only
            </span>
          ) : (
            <span className="shrink-0 font-mono text-[10.5px] text-faint">validating…</span>
          )}
        </div>
        <div className="flex overflow-x-auto px-3 py-3.5 [-webkit-mask-image:linear-gradient(to_right,black_88%,transparent)] [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:px-4 sm:[-webkit-mask-image:none] sm:[mask-image:none]">
          <div className="mr-3 select-none text-right font-mono text-[10.5px] leading-[1.85] text-faint sm:mr-4 sm:text-[12.5px]" aria-hidden>
            {Array.from({ length: SQL_TOTAL_LINES }, (_, i) => (
              <div key={i} className={`transition-opacity duration-300 ${i < lines.length ? "opacity-60" : "opacity-20"}`}>{i + 1}</div>
            ))}
          </div>
          <pre className="m-0 min-w-0 flex-1 whitespace-pre font-mono text-[10.5px] leading-[1.85] sm:text-[12.5px]">
            {lines.map((line, li) => (
              <div key={li}>
                {line.map(([text, kind], ti) => (
                  <span key={ti} className={TOKEN_CLASS[kind]}>{text}</span>
                ))}
                {li === lines.length - 1 && !done ? (
                  <span className="ml-0.5 inline-block h-3.5 w-[6px] translate-y-0.5 bg-accent" style={{ animation: "qw-blink 0.9s step-end infinite" }} />
                ) : null}
                {line.length === 0 && !(li === lines.length - 1 && !done) ? " " : null}
              </div>
            ))}
          </pre>
        </div>
      </div>

      <div className="flex min-h-[26px] flex-wrap items-center gap-2">
        {done
          ? SQL_CHECKS.map((check, i) => (
              <motion.span
                key={check}
                initial={{ opacity: 0, y: 6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.12, ...spring }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 font-mono text-[10.5px] text-muted"
              >
                <Check className="size-3 text-accent-strong" strokeWidth={2.5} />
                {check}
              </motion.span>
            ))
          : null}
      </div>

      {done ? (
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, ...spring }} className="px-1 text-[13px] leading-relaxed text-faint">
          <b className="font-medium text-muted">In plain English:</b> total units sold per product, best sellers first.
        </motion.p>
      ) : null}
    </div>
  );
}

function ChartScene() {
  const [type, setType] = useState(0);
  const types = ["Bar", "Line", "Area", "Pie"] as const;

  useEffect(() => {
    const timer = window.setInterval(() => setType((t) => (t + 1) % types.length), 1800);
    return () => window.clearInterval(timer);
  }, [types.length]);

  const linePath = "M0,66 L14,48 L28,56 L42,30 L57,38 L71,14 L85,22 L100,6";
  const bars = [38, 52, 44, 66, 58, 80, 72, 96];

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">Monthly revenue</p>
          <p className="font-mono text-[10px] text-faint">12 rows · auto-selected</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {types.map((label, i) => (
            <span
              key={label}
              className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-all duration-300 ${
                type === i ? "border-transparent bg-accent text-accent-ink shadow-[0_2px_8px_-2px_var(--accent-line)]" : "border-border text-muted"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* y-axis + gridlines */}
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
          {["$90k", "$60k", "$30k", "$0"].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right font-mono text-[9px] text-faint">{v}</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
          ))}
        </div>
        <div className="absolute inset-y-0 left-12 right-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={type}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.03 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-end justify-center gap-2"
            >
              {type === 0 &&
                bars.map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ delay: i * 0.04, ...spring }}
                    className={`max-w-[52px] flex-1 rounded-t-[5px] ${i === bars.length - 1 ? "bg-gradient-to-b from-accent-strong to-accent" : "bg-accent/30"}`}
                  />
                ))}
              {type === 1 && (
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="overflow-visible">
                  <motion.path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} vectorEffect="non-scaling-stroke" />
                </svg>
              )}
              {type === 2 && (
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="qw-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <motion.path d={`${linePath} L100,100 L0,100 Z`} fill="url(#qw-area)" stroke="var(--accent)" strokeWidth="2" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} vectorEffect="non-scaling-stroke" />
                </svg>
              )}
              {type === 3 && (
                <div className="flex size-full items-center justify-center">
                  <svg width="132" height="132" viewBox="0 0 32 32" className="-rotate-90">
                    <circle r="12" cx="16" cy="16" fill="none" stroke="var(--accent-soft)" strokeWidth="7" />
                    <motion.circle r="12" cx="16" cy="16" fill="none" stroke="var(--accent)" strokeWidth="7" strokeDasharray="75.4" initial={{ strokeDashoffset: 75.4 }} animate={{ strokeDashoffset: 27 }} transition={{ duration: 0.9, ease: "easeOut" }} />
                  </svg>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <p className="mt-4 shrink-0 text-center font-mono text-[11px] text-faint">picked from the shape of your data — override anytime</p>
    </div>
  );
}

function DashboardScene() {
  const [arranged, setArranged] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setArranged(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto grid h-full w-full max-w-2xl grid-cols-3 grid-rows-[1.4fr_1fr] content-stretch gap-3">
      <motion.div layout transition={spring} className={`flex min-h-0 flex-col rounded-xl border border-border bg-surface-2 p-4 ${arranged ? "col-span-2" : "col-span-3"}`}>
        <div className="mb-auto flex items-center justify-between">
          <span className="text-xs font-semibold text-text">Monthly revenue</span>
          <span className="font-mono text-[9px] text-faint">bar · auto</span>
        </div>
        <div className="flex h-[62%] items-end gap-1.5">
          {[42, 54, 48, 64, 58, 78].map((h, i) => (
            <span key={i} className={`flex-1 rounded-t-[3px] ${i === 5 ? "bg-gradient-to-b from-accent-strong to-accent" : "bg-accent/30"}`} style={{ height: `${h}%` }} />
          ))}
        </div>
      </motion.div>
      <AnimatePresence>
        {arranged ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={spring}
            className="flex min-h-0 flex-col justify-between rounded-xl border border-accent-line bg-surface-2 p-4 shadow-[0_0_0_2px_var(--accent)]"
          >
            <span className="text-xs font-semibold text-accent-strong">New widget</span>
            <span className="font-syne text-2xl font-bold text-text">24k</span>
            <span className="font-mono text-[9px] text-accent-strong">just pinned ✓</span>
          </motion.div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-2" aria-hidden />
        )}
      </AnimatePresence>
      <motion.div layout transition={spring} className="flex min-h-0 flex-col justify-between rounded-xl border border-border bg-surface-2 p-4">
        <span className="text-xs font-semibold text-text">Active users</span>
        <span className="font-syne text-2xl font-bold text-text">8,412</span>
        <span className="font-mono text-[9px] text-accent-strong">▲ 38 this week</span>
      </motion.div>
      <motion.div layout transition={spring} className="flex min-h-0 flex-col justify-between rounded-xl border border-border bg-surface-2 p-4">
        <span className="text-xs font-semibold text-text">Churn</span>
        <span className="font-syne text-2xl font-bold text-text">1.8%</span>
        <span className="font-mono text-[9px] text-faint">▼ 0.2 pts</span>
      </motion.div>
      <motion.div layout transition={spring} className="flex min-h-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 p-4 font-mono text-[11px] text-accent-strong">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
        </span>
        auto-refresh
      </motion.div>
    </div>
  );
}

function ShareScene() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const on = window.setTimeout(() => setCopied(true), 900);
    const off = window.setTimeout(() => setCopied(false), 3400);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, []);

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-4">
      {/* the dashboard being shared */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-text">Company KPIs</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent-strong">
            <span className="size-1.5 rounded-full bg-accent" style={{ animation: "qw-pulse 1.8s ease-in-out infinite" }} />
            LIVE DATA
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 flex h-20 items-end gap-1 rounded-lg border border-border/70 bg-surface p-2">
            {[40, 55, 48, 66, 60, 82, 74].map((h, i) => (
              <span key={i} className={`flex-1 rounded-t-[2px] ${i === 5 ? "bg-accent" : "bg-accent/40"}`} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex h-20 flex-col justify-between rounded-lg border border-border/70 bg-surface p-2.5">
            <span className="text-[9px] font-semibold text-faint">MRR</span>
            <span className="font-syne text-base font-bold text-text">$84k</span>
            <span className="font-mono text-[8.5px] text-accent-strong">▲ 12%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
        <Link2 className="size-3.5 shrink-0 text-accent-strong" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">querywise.tech/shared/x7f2-kq91</span>
        <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${copied ? "bg-accent-soft text-accent-strong" : "bg-accent text-accent-ink shadow-[0_4px_12px_-4px_var(--accent-line)]"}`}>
          {copied ? "✓ Copied" : "Copy link"}
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, ...spring }}
        className="flex items-center justify-center gap-2.5"
      >
        <span className="flex -space-x-1.5" aria-hidden>
          {["from-accent to-accent-strong", "from-chart-2 to-warning", "from-chart-4 to-chart-5"].map((g, i) => (
            <span key={i} className={`size-5 rounded-full border-2 border-surface bg-gradient-to-br ${g}`} />
          ))}
        </span>
        <span className="text-[11.5px] text-muted">3 people viewing right now</span>
      </motion.div>

      <div className="flex items-center justify-center gap-4 font-mono text-[11px] text-faint">
        <span className="flex items-center gap-1.5"><Lock className="size-3" strokeWidth={1.75} />password optional</span>
        <span>·</span>
        <span>SQL never exposed</span>
      </div>
    </div>
  );
}

function SecurityScene() {
  const steps = ["Credentials encrypted at rest", "Connection pinned & isolated", "Every query validated read-only", "Full audit trail recorded"];
  const [done, setDone] = useState(0);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDone((current) => {
        if (current >= steps.length) { window.clearInterval(timer); return current; }
        return current + 1;
      });
    }, 750);
    const blockTimer = window.setTimeout(() => setBlocked(true), 1600);
    return () => { window.clearInterval(timer); window.clearTimeout(blockTimer); };
  }, [steps.length]);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* enforcement checklist */}
        <div className="rounded-2xl border border-border bg-surface-2 p-5">
          {steps.map((label, i) => {
            const isDone = i < done;
            return (
              <div key={label} className={`flex items-center gap-3 ${i < steps.length - 1 ? "mb-4" : ""}`}>
                <motion.span
                  animate={{ backgroundColor: isDone ? "var(--accent)" : "var(--surface)", borderColor: isDone ? "var(--accent)" : "var(--border)" }}
                  transition={{ duration: 0.25 }}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border-2"
                >
                  {isDone ? <Check className="size-2.5 text-accent-ink" strokeWidth={3.5} /> : null}
                </motion.span>
                <span className={`text-[13px] font-medium transition-colors duration-300 ${isDone ? "text-text" : "text-faint"}`}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* what enforcement looks like */}
        <div className="flex flex-col justify-center gap-3 rounded-2xl border border-border bg-code-bg p-5 font-mono text-[12px]">
          <span className="text-[9.5px] uppercase tracking-[0.14em] text-faint">Attempted</span>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate"><span className="text-danger">DROP TABLE</span><span className="text-code-text"> customers;</span></span>
            {blocked ? (
              <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[9.5px] text-danger" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
                ✗ blocked
              </span>
            ) : null}
          </div>
          <div className="h-px w-full bg-border" aria-hidden />
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate"><span className="text-[var(--code-kw)]">SELECT</span><span className="text-code-text"> name, mrr …</span></span>
            <span className="shrink-0 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[9.5px] text-accent-strong">✓ allowed</span>
          </div>
          <span className="mt-1 text-[10px] leading-relaxed text-faint">Writes physically can&apos;t run — enforced before a single row is touched.</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {["AES-256", "read-only role", "SOC2-ready logs"].map((badge) => (
          <span key={badge} className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-[10.5px] text-muted">{badge}</span>
        ))}
      </div>
    </div>
  );
}

function ConnectionsScene() {
  const rows = [
    { name: "production_db", detail: "acme_analytics · 42 tables", status: "connected" as const },
    { name: "staging_db", detail: "acme_staging · 42 tables", status: "connected" as const },
    { name: "dev_local", detail: "acme_dev · syncing schema", status: "syncing" as const },
  ];
  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col justify-center gap-2.5">
      {rows.map((row, i) => (
        <motion.div
          key={row.name}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.09, ...spring }}
          className="flex items-center gap-3.5 rounded-xl border border-border bg-surface-2 px-4 py-3.5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-accent-soft">
            <Database className="size-4 text-accent-strong" strokeWidth={1.75} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13.5px] font-semibold text-text">{row.name}</span>
            <span className="truncate font-mono text-[10.5px] text-faint">{row.detail}</span>
          </span>
          {row.status === "connected" ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] text-accent-strong">
              <span className="size-1.5 rounded-full bg-accent" />
              connected
            </span>
          ) : (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11.5px] text-warning">
              <span className="size-1.5 rounded-full bg-warning" style={{ animation: "qw-pulse 1.4s ease-in-out infinite" }} />
              syncing
            </span>
          )}
        </motion.div>
      ))}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, ...spring }}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-2 px-4 py-3.5 text-[12.5px] text-faint transition-colors duration-200 hover:border-accent-line hover:text-muted"
      >
        <Plus className="size-3.5" strokeWidth={2} />
        Add connection — paste a read-only string
      </motion.div>
      <p className="mt-2 text-center font-mono text-[11px] text-faint">one workspace · every environment · always in sync</p>
    </div>
  );
}
