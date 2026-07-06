"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  Check,
  Database,
  LayoutDashboard,
  Link2,
  Lock,
  MessageSquareText,
  ShieldCheck,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

/**
 * Feature showcase: auto-advancing scenes in a browser frame.
 * Replaces the previous 800vh scroll-jacked section — same story, no hijacked
 * scroll. Advances every 6s, pauses on hover, and any item is clickable.
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
  { id: "chat", icon: MessageSquareText, title: "Chat, not query", tag: "natural language", crumb: "querywise.app/chats", headline: "Ask in plain English.", line: "Follow-ups keep their context." },
  { id: "sql", icon: SquareTerminal, title: "See the SQL", tag: "never a black box", crumb: "generated query · explained", headline: "Generated, explained, read-only.", line: "Nothing runs you can't inspect." },
  { id: "charts", icon: BarChart3, title: "Charts, automatic", tag: "zero config", crumb: "visualization · auto-selected", headline: "The right chart, picked for you.", line: "From the shape of your data." },
  { id: "dashboards", icon: LayoutDashboard, title: "Live dashboards", tag: "pin & refresh", crumb: "dashboards/company-kpis", headline: "Pin answers as widgets.", line: "They refresh themselves." },
  { id: "sharing", icon: Link2, title: "Public sharing", tag: "secure links", crumb: "shared/x7f2 · public", headline: "Share a link, live data.", line: "Password optional. SQL never exposed." },
  { id: "security", icon: ShieldCheck, title: "Safe by default", tag: "passes review", crumb: "security", headline: "Encrypted, read-only, audited.", line: "Credentials never touch the browser." },
  { id: "connections", icon: Database, title: "Every database", tag: "one workspace", crumb: "connections", headline: "Dev, staging, prod.", line: "All in one place, always synced." },
];

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
    <section id="features" ref={sectionRef} className="border-t border-border bg-bg px-7 py-28">
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
          <div className="flex snap-x gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0" role="tablist" aria-label="Features">
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
                    className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] border transition-colors duration-200 ${
                      on ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface text-muted"
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

          {/* Scene panel */}
          <div className="relative flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow)] lg:min-h-[520px] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),var(--shadow)]">
            <BrowserBar crumb={current.crumb} />
            <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
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
              <div className="relative min-h-0 flex-1">
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
    </section>
  );
}

/* ------------------------------- Chrome ---------------------------------- */

function BrowserBar({ crumb }: { crumb: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
      <span className="size-[10px] rounded-full bg-[#F26D6D]" />
      <span className="size-[10px] rounded-full bg-[#F2C36D]" />
      <span className="size-[10px] rounded-full bg-[#5FCB7E]" />
      <AnimatePresence mode="wait">
        <motion.span
          key={crumb}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className="ml-2.5 flex items-center gap-1.5 font-mono text-[11px] text-faint"
        >
          <Lock className="size-3" strokeWidth={1.75} />
          {crumb}
        </motion.span>
      </AnimatePresence>
    </div>
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
    <div className="mx-auto flex h-full max-w-md flex-col justify-end gap-3">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="max-w-[85%] self-start rounded-[14px] rounded-bl-md border border-border bg-surface-2 px-4 py-2.5 text-sm text-muted">
        Top seller: <b className="font-semibold text-text">Trail Pack</b> — 4,210 units
      </motion.div>
      <div className="flex min-h-[42px] max-w-[85%] items-center self-end rounded-[14px] rounded-br-md border border-accent-line bg-accent-soft px-4 py-2.5 text-sm text-text">
        {question.slice(0, typed)}
        {typed < question.length ? <span className="ml-0.5 inline-block h-4 w-0.5 bg-accent" style={{ animation: "qw-blink 0.9s step-end infinite" }} /> : null}
      </div>
      <div className="min-h-[148px]">
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
                  className="flex-1 rounded-t-[3px] bg-gradient-to-b from-accent-strong to-accent"
                />
              ))}
            </div>
          </motion.div>
        ) : null}
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

function SqlScene() {
  const [shown, setShown] = useState(0);
  const done = shown >= SQL_SCENE_TOKENS.length;

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
    <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-3">
      <div className="rounded-[14px] border border-border bg-code-bg p-5">
        <div className="mb-3.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Generated SQL</span>
          {done ? (
            <span className="rounded-full border border-accent-line px-2.5 py-0.5 font-mono text-[10.5px] text-accent-strong" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
              ✓ read-only
            </span>
          ) : (
            <span className="font-mono text-[10.5px] text-faint">validating…</span>
          )}
        </div>
        <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-[1.85]">
          {SQL_SCENE_TOKENS.slice(0, shown).map(([text, kind], i) => (
            <span key={i} className={TOKEN_CLASS[kind]}>{text}</span>
          ))}
          {!done ? <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-accent align-middle" style={{ animation: "qw-blink 0.9s step-end infinite" }} /> : null}
        </pre>
      </div>
      {done ? (
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="px-1 text-[13px] leading-relaxed text-faint">
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

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center">
      <div className="mb-6 flex justify-center gap-1.5">
        {types.map((label, i) => (
          <span
            key={label}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors duration-300 ${
              type === i ? "border-transparent bg-accent text-accent-ink" : "border-border text-muted"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="relative h-44">
        {/* gridlines so the chart reads as a chart, not floating shapes */}
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-px w-full bg-border/60" />)}
        </div>
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
              [38, 52, 44, 66, 58, 80, 72, 96].map((h, i) => (
                <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * 0.04, ...spring }} className="flex-1 rounded-t-[5px] bg-gradient-to-b from-accent-strong to-accent" />
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
      <p className="mt-4 text-center font-mono text-[11px] text-faint">picked from the shape of your data — override anytime</p>
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
    <div className="mx-auto grid h-full max-w-md content-center gap-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
      <motion.div layout transition={spring} className={`flex h-[132px] flex-col rounded-xl border border-border bg-surface-2 p-4 ${arranged ? "col-span-2" : "col-span-3"}`}>
        <span className="mb-auto text-xs font-semibold text-text">Monthly revenue</span>
        <div className="flex h-[58%] items-end gap-1.5">
          {[42, 54, 48, 64, 78].map((h, i) => (
            <span key={i} className="flex-1 rounded-[3px] bg-accent" style={{ height: `${h}%`, opacity: 0.5 + i * 0.1 }} />
          ))}
        </div>
      </motion.div>
      <AnimatePresence>
        {arranged ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={spring}
            className="flex h-[132px] flex-col justify-between rounded-xl border border-accent-line bg-surface-2 p-4 shadow-[0_0_0_2px_var(--accent)]"
          >
            <span className="text-xs font-semibold text-accent-strong">New widget</span>
            <span className="font-syne text-2xl font-bold text-text">24k</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.div layout transition={spring} className="flex h-24 flex-col justify-between rounded-xl border border-border bg-surface-2 p-4">
        <span className="text-xs font-semibold text-text">Active users</span>
        <span className="font-syne text-2xl font-bold text-text">8,412</span>
      </motion.div>
      <motion.div layout transition={spring} className="flex h-24 flex-col justify-between rounded-xl border border-border bg-surface-2 p-4">
        <span className="text-xs font-semibold text-text">Churn</span>
        <span className="font-syne text-xl font-bold text-text">1.8%</span>
      </motion.div>
      <motion.div layout transition={spring} className="flex h-24 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 p-4 font-mono text-[11px] text-accent-strong">
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
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-4">
      {/* the dashboard being shared — dimmed backdrop, not an empty box */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2 p-4 opacity-90">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-text">Company KPIs</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent-strong">
            <span className="size-1.5 rounded-full bg-accent" />
            LIVE DATA
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 flex h-16 items-end gap-1 rounded-lg border border-border/70 bg-surface p-2">
            {[40, 55, 48, 66, 60, 82, 74].map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[2px] bg-accent/70" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex h-16 flex-col justify-between rounded-lg border border-border/70 bg-surface p-2">
            <span className="text-[9px] font-semibold text-faint">MRR</span>
            <span className="font-syne text-sm font-bold text-text">$84k</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
        <Link2 className="size-3.5 shrink-0 text-accent-strong" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">querywise.app/shared/x7f2-kq91</span>
        <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${copied ? "bg-accent-soft text-accent-strong" : "bg-accent text-accent-ink"}`}>
          {copied ? "✓ Copied" : "Copy link"}
        </span>
      </div>
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDone((current) => {
        if (current >= steps.length) { window.clearInterval(timer); return current; }
        return current + 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="mx-auto flex h-full max-w-sm flex-col justify-center gap-5">
      <div className="rounded-2xl border border-border bg-surface-2 p-6">
        {steps.map((label, i) => {
          const isDone = i < done;
          return (
            <div key={label} className={`flex items-center gap-3.5 ${i < steps.length - 1 ? "mb-5" : ""}`}>
              <motion.span
                animate={{ backgroundColor: isDone ? "var(--accent)" : "var(--surface)", borderColor: isDone ? "var(--accent)" : "var(--border)" }}
                transition={{ duration: 0.25 }}
                className="flex size-6 shrink-0 items-center justify-center rounded-full border-2"
              >
                {isDone ? <Check className="size-3 text-accent-ink" strokeWidth={3} /> : null}
              </motion.span>
              <span className={`text-sm font-medium transition-colors duration-300 ${isDone ? "text-text" : "text-faint"}`}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-center gap-2">
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
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-2.5">
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
      <p className="mt-2 text-center font-mono text-[11px] text-faint">one workspace · every environment · always in sync</p>
    </div>
  );
}
