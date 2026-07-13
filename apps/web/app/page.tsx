"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Check,
  Database,
  Landmark,
  Lock,
  Megaphone,
  Moon,
  Package,
  ShieldCheck,
  Sun,
  TrendingUp,
  Truck,
  Users,
  X,
} from "lucide-react";

import FeaturesJourney from "@/components/FeaturesJourney";

/* ----------------------------- Demo content ------------------------------ */

const EXAMPLES = [
  {
    label: "Monthly revenue",
    q: "Show monthly revenue for the last 12 months",
    sql: "SELECT date_trunc('month', o.created_at) AS month,\n       SUM(o.total_amount) AS revenue\nFROM orders o\nWHERE o.created_at >= now() - interval '12 months'\nGROUP BY 1 ORDER BY 1;",
    chartTitle: "Monthly revenue",
    chartMeta: "12 rows · 38 ms",
    labels: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    values: [34, 41, 38, 52, 47, 58, 55, 63, 60, 72, 69, 84],
    peakLabel: "$84k",
    dash: "Company KPIs",
  },
  {
    label: "Top products",
    q: "Which products sold the most last quarter?",
    sql: "SELECT p.name, SUM(oi.quantity) AS units_sold\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nWHERE oi.created_at >= now() - interval '3 months'\nGROUP BY p.name\nORDER BY units_sold DESC LIMIT 5;",
    chartTitle: "Top products by units sold",
    chartMeta: "5 rows · 24 ms",
    labels: ["Trail Pack", "Aero Bottle", "Flux Mat", "Core Tee", "Ridge Cap"],
    values: [88, 71, 64, 52, 40],
    peakLabel: "4.2k",
    dash: "Sales",
  },
  {
    label: "Weekly signups",
    q: "How many new customers signed up each week?",
    sql: "SELECT date_trunc('week', created_at) AS week,\n       COUNT(*) AS signups\nFROM customers\nWHERE created_at >= now() - interval '8 weeks'\nGROUP BY 1 ORDER BY 1;",
    chartTitle: "Weekly customer signups",
    chartMeta: "8 rows · 31 ms",
    labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
    values: [30, 42, 38, 55, 61, 58, 74, 82],
    peakLabel: "82",
    dash: "Growth",
  },
];

const STEP_LABELS = ["understand", "generate sql", "validate read-only", "execute", "chart"];

/* ----------------------------- SQL highlighter --------------------------- */

const KEYWORDS = new Set(["SELECT", "FROM", "WHERE", "GROUP", "ORDER", "BY", "JOIN", "ON", "AS", "DESC", "ASC", "LIMIT", "AND", "OR", "INTERVAL"]);
const FUNCS = new Set(["date_trunc", "sum", "count", "now", "avg", "min", "max"]);

interface SqlToken { text: string; color: string }

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  const re = /('[^']*'|\b\d+(?:\.\d+)?\b|\w+|[^\w\s]+|\s+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    const t = match[0];
    let color = "var(--code-text)";
    if (t.startsWith("'")) color = "var(--code-str)";
    else if (/^\d/.test(t)) color = "var(--code-num)";
    else if (KEYWORDS.has(t.toUpperCase())) color = "var(--code-kw)";
    else if (FUNCS.has(t.toLowerCase())) color = "var(--code-fn)";
    else if (/^[^\w\s]+$/.test(t)) color = "var(--code-punct)";
    tokens.push({ text: t, color });
  }
  return tokens;
}

/** Splits a token stream into per-line arrays so we can render a gutter. */
function tokensToLines(tokens: SqlToken[]): SqlToken[][] {
  const lines: SqlToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, color: token.color });
    });
  }
  return lines;
}

/* ----------------------------- Hero demo hook ---------------------------- */

function useHeroDemo() {
  const [exIdx, setExIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [sqlShown, setSqlShown] = useState(0);
  const [grown, setGrown] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const runToken = useRef(0);
  const [startIdx, setStartIdx] = useState(0);
  const [runId, setRunId] = useState(0);

  const play = useCallback(async (i: number) => {
    const token = ++runToken.current;
    const guard = () => token === runToken.current;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const ex = EXAMPLES[i];
    const sqlTokens = tokenizeSql(ex.sql);

    setExIdx(i); setTyped(""); setIsTyping(true); setStepIdx(-1);
    setSqlShown(0); setShowChart(false); setGrown(false); setShowWidget(false);

    await delay(450); if (!guard()) return;
    for (let c = 1; c <= ex.q.length; c += 1) {
      setTyped(ex.q.slice(0, c));
      await delay(24); if (!guard()) return;
    }
    await delay(280); if (!guard()) return;
    setIsTyping(false); setStepIdx(0);

    await delay(450); if (!guard()) return;
    setStepIdx(1);
    // The SQL streams in token by token, like the real product
    for (let t = 1; t <= sqlTokens.length; t += 1) {
      setSqlShown(t);
      await delay(16); if (!guard()) return;
    }
    await delay(200); if (!guard()) return;
    setStepIdx(2);
    await delay(650); if (!guard()) return;
    setStepIdx(3);
    await delay(550); if (!guard()) return;
    setShowChart(true); setStepIdx(4);
    await delay(80); if (!guard()) return;
    setGrown(true);
    await delay(1000); if (!guard()) return;
    setStepIdx(5); setShowWidget(true);
  }, []);

  // Driver loop: plays examples in order, restartable from any index via select().
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let i = startIdx;
      while (!cancelled) {
        await play(i);
        await new Promise((resolve) => setTimeout(resolve, 4200));
        i = (i + 1) % EXAMPLES.length;
      }
    })();
    return () => {
      cancelled = true;
      runToken.current += 1;
    };
  }, [play, startIdx, runId]);

  const select = useCallback((i: number) => {
    setStartIdx(i);
    setRunId((n) => n + 1);
  }, []);

  return { exIdx, typed, isTyping, stepIdx, sqlShown, grown, showChart, showWidget, select };
}

type HeroDemoState = ReturnType<typeof useHeroDemo>;

/** Counts up to the numeric part of `target` once `active` flips true. */
function CountUp({ target, active }: { target: string; active: boolean }) {
  const numeric = parseFloat(target.replace(/[^0-9.]/g, ""));
  const prefix = target.startsWith("$") ? "$" : "";
  const suffix = /[a-z]$/i.test(target) ? target.slice(-1) : "";
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 450, 1);
      setValue(numeric * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, numeric]);

  return <>{prefix}{Math.round(active ? value : 0)}{suffix}</>;
}

/* --------------------------------- Page ---------------------------------- */

export default function QueryWiseLanding() {
  const demo = useHeroDemo();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("rv");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-bg font-sans text-text">
      <Nav />
      <Hero demo={demo} />
      <PrinciplesStrip />
      <FeaturesJourney />
      <HowItWorks />
      <DashboardShowcase />
      <Comparison />
      <UseCases />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ---------------------------------- Nav ----------------------------------- */

function Nav() {
  const links = [["#features", "Features"], ["#how", "How it works"], ["#pricing", "Pricing"], ["#faq", "FAQ"]] as const;

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("querywise.theme", isDark ? "dark" : "light"); } catch { /* private mode */ }
  }

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border bg-nav-bg backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-7">
        <a href="#top" className="flex items-center gap-2.5 text-text no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="assets/logo.png" alt="QueryWise" className="size-8 object-contain" />
          <span className="text-lg font-bold tracking-[-0.01em]">QueryWise</span>
        </a>
        <div className="ml-auto hidden items-center gap-1 md:flex">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-[14.5px] text-muted no-underline transition-colors hover:bg-accent-soft hover:text-text">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <button
            type="button"
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
            className="flex size-9 items-center justify-center rounded-[10px] border border-border text-muted transition-colors hover:border-border-2 hover:text-text"
          >
            <Sun className="hidden size-4 dark:block" strokeWidth={1.75} />
            <Moon className="size-4 dark:hidden" strokeWidth={1.75} />
          </button>
          <Link href="/sign-in" className="hidden px-1.5 py-2 text-[14.5px] text-muted no-underline transition-colors hover:text-text sm:block">Sign in</Link>
          <Link
            href="/sign-up"
            className="rounded-[10px] bg-accent px-4 py-2 text-[14.5px] font-semibold text-accent-ink no-underline transition-all duration-150 hover:-translate-y-px hover:shadow-[0_8px_24px_-8px_var(--accent-line)]"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero({ demo }: { demo: HeroDemoState }) {
  return (
    <header id="top" className="relative overflow-hidden px-7 pb-24 pt-36" style={{ background: "var(--glow), var(--bg)" }}>
      {/* blueprint grid, masked to the top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 20%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[340px] w-[640px] -translate-x-1/2 blur-[40px]"
        style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)", animation: "qw-float 9s ease-in-out infinite" }}
      />

      <div className="relative mx-auto flex max-w-[1180px] flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3.5 py-1.5 font-mono text-xs tracking-[0.06em] text-accent-strong">
          <span className="size-[7px] rounded-full bg-accent" style={{ animation: "qw-pulse 2.2s ease-in-out infinite" }} />
          NOW IN BETA · WORKS WITH POSTGRESQL
        </div>

        <h1 className="mt-7 max-w-[920px] font-syne text-[clamp(40px,5.5vw,76px)] font-bold leading-[1.04] tracking-[-0.02em] [text-wrap:balance]">
          {"Your database speaks SQL. You don't have to.".split(" ").map((word, i) => (
            <span key={i} className="inline-block" style={{ animation: `qw-word-in 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.045}s both` }}>
              {word}&nbsp;
            </span>
          ))}
        </h1>

        <p className="mt-6 max-w-[640px] text-[clamp(16px,1.6vw,19px)] leading-[1.65] text-muted [text-wrap:pretty]" style={{ animation: "qw-rise 0.6s cubic-bezier(0.16,1,0.3,1) 0.35s both" }}>
          Ask questions in plain English. QueryWise writes safe, read-only SQL, picks the right chart, and turns answers into dashboards you can share with anyone.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3.5" style={{ animation: "qw-rise 0.6s cubic-bezier(0.16,1,0.3,1) 0.45s both" }}>
          <Link
            href="/sign-up"
            className="group flex items-center gap-2 rounded-xl bg-accent px-7 py-3.5 text-base font-semibold text-accent-ink no-underline transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_var(--accent-line)] active:translate-y-0 active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
          <a
            href="#how"
            className="rounded-xl border border-border-2 bg-surface px-7 py-3.5 text-base font-medium text-text no-underline transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-line"
          >
            See how it works
          </a>
        </div>
        <p className="mt-4 font-mono text-xs text-faint" style={{ animation: "qw-rise 0.6s cubic-bezier(0.16,1,0.3,1) 0.55s both" }}>
          No credit card · Connect a demo database in 30 seconds
        </p>

        <HeroDemo demo={demo} />
      </div>
    </header>
  );
}

function HeroDemo({ demo }: { demo: HeroDemoState }) {
  const ex = EXAMPLES[demo.exIdx];
  const sqlTokens = tokenizeSql(ex.sql);
  const sqlLines = tokensToLines(sqlTokens.slice(0, demo.sqlShown));
  const totalLines = ex.sql.split("\n").length;
  const maxIdx = ex.values.indexOf(Math.max(...ex.values));
  const sqlDone = demo.sqlShown >= sqlTokens.length;
  const sent = !demo.isTyping && demo.typed.length > 0;
  const composerActive = demo.isTyping && demo.typed.length > 0;

  return (
    <div className="mt-16 w-full max-w-[880px] text-left" style={{ animation: "qw-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.65s both" }}>
      {/* example switcher — segmented, compact */}
      <div className="mb-5 flex justify-center">
        <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {EXAMPLES.map((example, i) => {
            const on = i === demo.exIdx;
            return (
              <button
                key={example.label}
                type="button"
                onClick={() => demo.select(i)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200 active:scale-[0.97] sm:px-4 ${
                  on ? "bg-accent text-accent-ink shadow-[0_2px_10px_-2px_var(--accent-line)]" : "text-muted hover:text-text"
                }`}
              >
                <span className={`font-mono text-[10px] tabular-nums ${on ? "text-accent-ink/70" : "text-faint"}`}>0{i + 1}</span>
                {example.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* product window */}
      <div className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),var(--shadow)]">
        {/* chrome */}
        <div className="relative flex items-center border-b border-border bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-[10px] rounded-full bg-[#F26D6D]" />
            <span className="size-[10px] rounded-full bg-[#F2C36D]" />
            <span className="size-[10px] rounded-full bg-[#5FCB7E]" />
          </div>
          <span className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 font-mono text-[11px] text-faint">
            <Lock className="size-3 text-accent-strong" strokeWidth={1.75} />
            querywise.app/chats
          </span>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 font-mono text-[10px] text-accent-strong sm:flex">
            <Database className="size-3" strokeWidth={1.75} />
            acme_analytics · read-only
          </span>
        </div>

        <div className="flex h-[720px] flex-col p-4 sm:p-5">
          {/* conversation */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {/* sent message */}
            {sent ? (
              <div className="flex justify-end" style={{ animation: "qw-pop 0.35s cubic-bezier(0.2,0.7,0.3,1) both" }}>
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] font-medium text-accent-ink shadow-[0_6px_18px_-8px_var(--accent-line)]">
                  {demo.typed}
                </div>
              </div>
            ) : null}

            {/* pipeline — connected stepper */}
            {demo.stepIdx >= 0 ? (
              <div className="flex flex-wrap items-center gap-y-2 pl-0.5" style={{ animation: "qw-fadeup 0.4s ease both" }}>
                {STEP_LABELS.map((label, i) => {
                  const done = demo.stepIdx > i;
                  const active = demo.stepIdx === i;
                  return (
                    <React.Fragment key={label}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                            done ? "border-accent bg-accent text-accent-ink" : active ? "border-accent bg-accent-soft" : "border-border-2 bg-surface"
                          }`}
                        >
                          {done ? (
                            <Check className="size-2.5" strokeWidth={3.5} />
                          ) : active ? (
                            <span className="size-1.5 rounded-full bg-accent" style={{ animation: "qw-pulse 1s ease-in-out infinite" }} />
                          ) : null}
                        </span>
                        <span className={`whitespace-nowrap font-mono text-[11px] tracking-[0.02em] transition-colors duration-300 ${done ? "text-accent-strong" : active ? "text-text" : "text-faint"}`}>
                          {label}
                        </span>
                      </span>
                      {i < STEP_LABELS.length - 1 ? (
                        <span className={`mx-2 hidden h-px w-3 shrink-0 transition-colors duration-300 sm:block sm:w-5 ${done ? "bg-accent-line" : "bg-border-2"}`} />
                      ) : (
                        <span className="mr-3 sm:mr-0" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : null}

            {/* SQL — editor card with gutter, streams token by token */}
            {demo.sqlShown > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border bg-code-bg" style={{ animation: "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both" }}>
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <span className="flex items-center gap-2 font-mono text-[11px] text-faint">
                    <span
                      className={`size-1.5 rounded-full transition-colors duration-300 ${sqlDone ? "bg-accent" : "bg-warning"}`}
                      style={!sqlDone ? { animation: "qw-pulse 1s ease-in-out infinite" } : undefined}
                    />
                    generated_query.sql
                  </span>
                  {sqlDone ? (
                    <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[10.5px] text-accent-strong" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
                      ✓ read-only · passed
                    </span>
                  ) : (
                    <span className="font-mono text-[10.5px] text-faint">writing…</span>
                  )}
                </div>
                <div className="flex overflow-x-auto px-4 py-3">
                  <div className="mr-4 select-none text-right font-mono text-[12.5px] leading-[1.8] text-faint" aria-hidden>
                    {Array.from({ length: totalLines }, (_, i) => (
                      <div key={i} className={`transition-opacity duration-300 ${i < sqlLines.length ? "opacity-60" : "opacity-20"}`}>{i + 1}</div>
                    ))}
                  </div>
                  <pre className="m-0 min-w-0 flex-1 whitespace-pre font-mono text-[12.5px] leading-[1.8]">
                    {sqlLines.map((line, li) => (
                      <div key={li}>
                        {line.map((token, ti) => (
                          <span key={ti} style={{ color: token.color }}>{token.text}</span>
                        ))}
                        {li === sqlLines.length - 1 && !sqlDone ? (
                          <span className="ml-0.5 inline-block h-3.5 w-[6px] translate-y-0.5 bg-accent" style={{ animation: "qw-blink 0.9s step-end infinite" }} />
                        ) : null}
                        {line.length === 0 && !(li === sqlLines.length - 1 && !sqlDone) ? " " : null}
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            ) : null}

            {/* chart — gridlines, baseline, highlighted peak */}
            {demo.showChart ? (
              <div className="rounded-xl border border-border bg-surface-2 p-5" style={{ animation: "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both" }}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="truncate text-sm font-semibold">{ex.chartTitle}</span>
                    <span className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-faint">{ex.chartMeta}</span>
                  </div>
                  <div className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
                    <span className="rounded-md bg-accent px-2 py-1 font-mono text-[10px] font-semibold text-accent-ink">chart</span>
                    <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-faint">table</span>
                    <span className="rounded-md border border-border px-2 py-1 font-mono text-[10px] text-faint">sql</span>
                  </div>
                </div>
                <div className="relative h-[150px]">
                  {/* gridlines + baseline */}
                  <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
                    <span className="h-px w-full bg-border/50" />
                    <span className="h-px w-full bg-border/50" />
                    <span className="h-px w-full bg-border/50" />
                    <span className="h-px w-full bg-border-2/70" />
                  </div>
                  <div className="relative flex h-full items-end justify-center gap-2 px-1 sm:gap-3">
                    {ex.labels.map((label, i) => {
                      const isPeak = i === maxIdx;
                      return (
                        <div key={label} className="flex h-full min-w-0 max-w-[56px] flex-1 flex-col justify-end">
                          {isPeak ? (
                            <span
                              className={`mb-1.5 self-center whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-accent-ink shadow-[0_4px_10px_-4px_var(--accent-line)] transition-all duration-300 ${
                                demo.grown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                              }`}
                            >
                              <CountUp target={ex.peakLabel} active={demo.grown} />
                            </span>
                          ) : null}
                          <div
                            className={`rounded-t-[5px] ${isPeak ? "bg-gradient-to-b from-accent-strong to-accent" : "bg-accent/25 hover:bg-accent/45"}`}
                            style={{ height: demo.grown ? `${ex.values[i]}%` : "2%", transition: `height 0.7s cubic-bezier(0.22,1,0.36,1) ${i * 30}ms, background-color 0.2s ease` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-1.5 flex justify-center gap-2 px-1 sm:gap-3">
                  {ex.labels.map((label) => (
                    <div key={label} className="min-w-0 max-w-[56px] flex-1 truncate text-center font-mono text-[9.5px] text-faint">{label}</div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* pinned confirmation */}
            {demo.showWidget ? (
              <div className="flex items-center gap-3 rounded-xl border border-accent-line bg-accent-soft px-4 py-3" style={{ animation: "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both" }}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink" style={{ animation: "qw-stamp 0.3s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}>
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="min-w-0 truncate text-[13.5px] text-text">
                  Pinned to <b className="font-semibold">{ex.dash}</b> dashboard
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-accent-strong">
                  <span className="size-1.5 rounded-full bg-accent" style={{ animation: "qw-pulse 1.8s ease-in-out infinite" }} />
                  live · auto-refresh
                </span>
              </div>
            ) : null}
          </div>

          {/* composer — where the typing actually happens */}
          <div
            className={`mt-3.5 flex shrink-0 items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition-all duration-200 ${
              composerActive ? "border-accent-line shadow-[0_0_0_3px_var(--accent-soft)]" : "border-border-2"
            }`}
          >
            <span className="min-h-[21px] min-w-0 flex-1 truncate text-[14.5px] text-text">
              {composerActive ? (
                <>
                  {demo.typed}
                  <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-[3px] bg-accent" style={{ animation: "qw-blink 0.9s step-end infinite" }} />
                </>
              ) : (
                <span className="text-faint">Ask anything about your data…</span>
              )}
            </span>
            <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-faint sm:block">⏎</kbd>
            <span
              aria-hidden
              className={`flex size-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                composerActive ? "scale-100 bg-accent text-accent-ink shadow-[0_4px_12px_-4px_var(--accent-line)]" : "scale-95 bg-surface-2 text-faint"
              }`}
            >
              <ArrowUp className="size-4" strokeWidth={2.25} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Principles strip ---------------------------- */

function PrinciplesStrip() {
  const principles = [
    { icon: ShieldCheck, label: "Read-only by design" },
    { icon: BadgeCheck, label: "SQL always visible" },
    { icon: Lock, label: "Credentials never in the browser" },
    { icon: Database, label: "Live data, never stale exports" },
  ];
  return (
    <section className="border-y border-border bg-bg-2 px-7 py-8">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-10 gap-y-3">
        {principles.map(({ icon: Icon, label }) => (
          <span key={label} className="flex items-center gap-2 font-mono text-[11.5px] tracking-[0.08em] text-muted">
            <Icon className="size-3.5 text-accent-strong" strokeWidth={1.75} />
            {label.toUpperCase()}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ How it works ------------------------------ */

const HOW_STEPS = [
  ["Connect your database", "Paste a read-only PostgreSQL connection string. Schema syncs automatically in the background."],
  ["Ask a question", "Type it like you'd say it out loud. Follow-ups keep the context of the conversation."],
  ["AI writes the SQL", "The agent explores your schema, plans the query, writes it — then shows and explains it to you."],
  ["Execute safely", "Single statement, read-only, bounded results — enforced before a single row is touched."],
  ["Charts appear", "The right visualization is picked from the shape of your data. Override it anytime."],
  ["Save & share", "Pin results to dashboards, then share with a secure public link — data always live."],
] as const;

function HowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-bg-2 px-7 py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="max-w-2xl">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">How it works</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">
            From connection string to shared dashboard
          </h2>
        </div>
        <div className="mt-14 grid gap-x-16 gap-y-0 md:grid-cols-2">
          {HOW_STEPS.map(([title, body], i) => (
            <div
              key={title}
              data-reveal
              className={`flex gap-5 py-[22px] ${i !== 2 && i !== 5 ? "border-b border-dashed border-border-2" : ""}`}
              style={{ transitionDelay: `${(i % 3) * 0.08}s` }}
            >
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border font-mono text-[15px] font-semibold ${
                  i === 5 ? "border-accent bg-accent text-accent-ink" : "border-accent-line bg-surface text-accent-strong"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="m-0 text-lg font-semibold">{title}</h3>
                <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Dashboard showcase --------------------------- */

function DashboardShowcase() {
  return (
    <section className="bg-bg px-7 py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Product demo</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">
            Watch a question become a dashboard
          </h2>
        </div>

        <div data-reveal className="mx-auto mt-12 max-w-[960px] overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--shadow)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),var(--shadow)]">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-[18px] py-3">
            <span className="size-[11px] rounded-full bg-[#F26D6D]" />
            <span className="size-[11px] rounded-full bg-[#F2C36D]" />
            <span className="size-[11px] rounded-full bg-[#5FCB7E]" />
            <span className="ml-2.5 font-mono text-xs text-faint">Company KPIs — dashboard</span>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-accent-strong">
              <span className="size-1.5 rounded-full bg-accent" style={{ animation: "qw-pulse 1.8s ease-in-out infinite" }} />
              LIVE DATA
            </span>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            {[["MRR", "$84,300", "▲ 12% MoM"], ["Active customers", "1,204", "▲ 38 this week"], ["Avg order value", "$96.40", "▲ 4.2%"]].map(([label, value, delta]) => (
              <div key={label} className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p>
                <p className="m-0 mt-2 font-syne text-[26px] font-bold leading-none">{value}</p>
                <p className="m-0 mt-2 font-mono text-xs text-accent-strong">{delta}</p>
              </div>
            ))}
            <div className="rounded-xl border border-border bg-surface-2 p-4 sm:col-span-2">
              <p className="m-0 mb-3 text-xs font-semibold">Monthly revenue</p>
              <div className="flex h-[120px] items-end gap-2">
                {[34, 44, 39, 55, 50, 62, 58, 68, 64, 76, 72, 88].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[3px] bg-accent"
                    style={{ height: `${h}%`, opacity: 0.45 + i / 24, animation: `qw-breathe 4s ease-in-out ${i * 0.15}s infinite` }}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col rounded-xl border border-border bg-surface-2 p-4">
              <p className="m-0 mb-3 text-xs font-semibold">Top categories</p>
              <div className="flex flex-1 flex-col justify-center gap-2.5">
                {([["Outdoor", 88], ["Fitness", 64], ["Apparel", 46]] as const).map(([name, w]) => (
                  <div key={name}>
                    <div className="mb-1 flex justify-between text-[10.5px] text-muted">
                      <span>{name}</span>
                      <span className="font-mono">{w}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- Comparison ------------------------------ */

function Comparison() {
  const typical = [
    "Learn a query builder before your first answer",
    "Configure every chart by hand",
    "Dashboards drift stale between refreshes",
    "Every new question is a ticket for the data team",
  ];
  const querywise = [
    "Ask in plain English, get an answer in seconds",
    "The right chart picked from your data's shape",
    "Widgets refresh themselves — always live",
    "Anyone on the team can self-serve, safely",
  ];
  return (
    <section className="border-y border-border bg-bg-2 px-7 py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="max-w-2xl">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Why QueryWise</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">
            BI tools make you learn them. QueryWise doesn&apos;t.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div data-reveal className="rounded-2xl border border-border bg-surface p-7">
            <p className="m-0 mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">A typical BI tool</p>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {typical.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] leading-relaxed text-muted">
                  <X className="mt-1 size-4 shrink-0 text-danger/70" strokeWidth={2} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal className="rounded-2xl border border-accent-line bg-surface p-7 shadow-[0_0_40px_-24px_var(--accent)]" style={{ transitionDelay: "0.1s" }}>
            <p className="m-0 mb-5 font-mono text-[11px] uppercase tracking-[0.16em] text-accent-strong">QueryWise</p>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {querywise.map((line) => (
                <li key={line} className="flex items-start gap-3 text-[15px] leading-relaxed text-text">
                  <Check className="mt-1 size-4 shrink-0 text-accent-strong" strokeWidth={2.5} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- Use cases ------------------------------- */

const QUESTION_WALL = [
  { icon: TrendingUp, team: "Sales", q: "How did each region perform against quota this quarter?" },
  { icon: Users, team: "Customers", q: "Which customers are at risk of churning this month?" },
  { icon: Landmark, team: "Finance", q: "Show gross margin by product line, month over month." },
  { icon: Package, team: "Inventory", q: "What's running low in the warehouse right now?" },
  { icon: Megaphone, team: "Marketing", q: "Which campaign drove the most signups per dollar?" },
  { icon: Truck, team: "Operations", q: "What's our average delivery time by city this week?" },
  { icon: TrendingUp, team: "Sales", q: "Which reps closed the most pipeline this month?" },
  { icon: Users, team: "Customers", q: "What's 90-day retention by signup cohort?" },
  { icon: Landmark, team: "Finance", q: "Where did spend grow fastest last quarter?" },
  { icon: Package, team: "Inventory", q: "Which SKUs moved fastest last week?" },
  { icon: Megaphone, team: "Marketing", q: "What's CAC by channel, trailing 90 days?" },
  { icon: Truck, team: "Operations", q: "How many orders missed SLA this week?" },
];

type WallItem = (typeof QUESTION_WALL)[number];

function QuestionPill({ icon: Icon, team, q }: WallItem) {
  return (
    <span className="group flex shrink-0 cursor-default items-center gap-3 rounded-2xl border border-border bg-surface py-2.5 pl-3 pr-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[0_10px_24px_-14px_var(--accent-line)]">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft transition-transform duration-200 group-hover:scale-110">
        <Icon className="size-3.5 text-accent-strong" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col gap-px">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">{team}</span>
        <span className="whitespace-nowrap text-[13px] text-muted transition-colors duration-200 group-hover:text-text">“{q}”</span>
      </span>
    </span>
  );
}

function MarqueeRow({ items, duration, reverse }: { items: WallItem[]; duration: number; reverse?: boolean }) {
  const group = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {items.map((item, i) => (
        <QuestionPill key={`${item.q}-${i}`} {...item} />
      ))}
    </div>
  );
  return (
    <div className="flex overflow-hidden">
      <div
        className="qw-marquee-track flex shrink-0"
        style={{ animation: `qw-marquee ${duration}s linear infinite`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}

function UseCases() {
  const rowA = QUESTION_WALL.filter((_, i) => i % 2 === 0);
  const rowB = QUESTION_WALL.filter((_, i) => i % 2 === 1);
  return (
    <section className="overflow-hidden bg-bg py-28">
      <div className="mx-auto max-w-[1180px] px-7">
        <div data-reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Use cases</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">
            One question away, whatever the team
          </h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-muted [text-wrap:pretty]">
            Real questions from real teams. Every one of them becomes a query, a chart, and a live dashboard widget — no ticket required.
          </p>
        </div>
      </div>

      <div data-reveal className="qw-marquee-group relative mt-14 flex flex-col gap-4">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-bg to-transparent sm:w-40" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-bg to-transparent sm:w-40" />
        <MarqueeRow items={rowA} duration={48} />
        <MarqueeRow items={rowB} duration={56} reverse />
      </div>

      <p data-reveal className="mt-12 text-center font-mono text-xs text-faint">
        …and anything else you can put into words.
        <a href="#top" className="ml-2 text-accent-strong no-underline hover:underline">Ask your own ↑</a>
      </p>
    </section>
  );
}

/* --------------------------------- Pricing -------------------------------- */

type PlanFeature = { text: string; included: boolean };

const FREE_FEATURES: PlanFeature[] = [
  { text: "25 AI questions / month, 5 per day", included: true },
  { text: "1 PostgreSQL connection, plus demo", included: true },
  { text: "Auto-charts & 1 dashboard", included: true },
  { text: "1 public share link, no password", included: true },
  { text: "Daily schema re-sync", included: true },
  { text: "Read-only safety, always on", included: true },
  { text: "Password-protected shares", included: false },
  { text: "Extended agent runs & priority", included: false },
];

const PRO_FEATURES: PlanFeature[] = [
  { text: "500 AI questions / month, 50 per day", included: true },
  { text: "5 PostgreSQL connections", included: true },
  { text: "Up to 100 dashboards", included: true },
  { text: "20 public share links, password OK", included: true },
  { text: "Extended agent runs for complex questions", included: true },
  { text: "20 schema re-syncs per day", included: true },
  { text: "Higher concurrency & priority", included: true },
  { text: "Email support, best-effort", included: true },
];

function PlanFeatureRow({ text, included }: PlanFeature) {
  return (
    <li className={`flex items-start gap-3 text-[14.5px] ${included ? "text-text" : "text-faint"}`}>
      {included ? (
        <Check className="mt-0.5 size-4 shrink-0 text-accent-strong" strokeWidth={2.5} />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-faint" strokeWidth={2.25} />
      )}
      <span className={included ? undefined : "line-through decoration-border-2"}>{text}</span>
    </li>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="border-y border-border bg-bg-2 px-7 py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Pricing</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">
            Start free. Scale when you need to.
          </h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-muted">
            Free is enough to prove QueryWise on real data. Pro unlocks volume, multi-DB workspaces, and password-protected sharing when you&apos;re ready. Payments are coming soon.
          </p>
        </div>

        <div data-reveal className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col rounded-3xl border border-border bg-surface p-8 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Free</p>
              <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] text-faint">
                Available now
              </span>
            </div>
            <div className="mt-4 flex items-end gap-1.5">
              <p className="m-0 font-syne text-5xl font-bold tracking-tight">$0</p>
              <p className="mb-1.5 text-sm text-faint">/ month</p>
            </div>
            <p className="m-0 mt-2 text-[14.5px] leading-relaxed text-muted">
              Try the full product path: connect, ask, and chart, without a credit card.
            </p>
            <ul className="m-0 mt-7 flex list-none flex-col gap-3 p-0">
              {FREE_FEATURES.map((f) => (
                <PlanFeatureRow key={f.text} {...f} />
              ))}
            </ul>
            <Link
              href="/sign-up"
              className="mt-8 block rounded-xl border border-border bg-bg px-6 py-3.5 text-center text-base font-semibold text-text no-underline transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-line hover:bg-surface-2"
            >
              Start free →
            </Link>
          </div>

          {/* Pro — coming soon */}
          <div className="relative flex flex-col overflow-hidden rounded-3xl border border-accent-line bg-surface p-8 shadow-[0_0_60px_-28px_var(--accent)]">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
            />
            <div className="relative flex items-center justify-between gap-3">
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-strong">Pro</p>
              <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] font-medium text-accent-strong">
                Coming soon
              </span>
            </div>
            <div className="relative mt-4 flex items-end gap-1.5">
              <p className="m-0 font-syne text-5xl font-bold tracking-tight">$29</p>
              <p className="mb-1.5 text-sm text-faint">/ month</p>
            </div>
            <p className="relative m-0 mt-2 text-[14.5px] leading-relaxed text-muted">
              For daily analysis: more questions, more databases, and dashboards you can share live.
            </p>
            <ul className="relative m-0 mt-7 flex list-none flex-col gap-3 p-0">
              {PRO_FEATURES.map((f) => (
                <PlanFeatureRow key={f.text} {...f} />
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="relative mt-8 w-full cursor-not-allowed rounded-xl bg-accent/70 px-6 py-3.5 text-base font-semibold text-accent-ink opacity-90"
            >
              Coming soon
            </button>
            <p className="relative m-0 mt-3 text-center font-mono text-[11px] text-faint">
              Checkout & billing not live yet
            </p>
          </div>
        </div>

        <p data-reveal className="mx-auto mt-10 max-w-xl text-center font-mono text-xs leading-relaxed text-faint">
          Limits are planned product caps — free usage stays fair so platform AI keys aren&apos;t exhausted.
          Team plans and usage-based top-ups may follow.
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------- FAQ ---------------------------------- */

const FAQS = [
  ["Is my data safe?", "Yes. Connections are read-only and every generated query is validated before it runs — no writes, no DDL, no system tables. Credentials are encrypted at rest and never reach the browser."],
  ["Which databases are supported?", "PostgreSQL today — including managed providers like RDS, Supabase, and Neon. More engines are on the roadmap."],
  ["Can it modify or delete my data?", "No. Enforcement is layered: a read-only role, single-statement validation, bounded results, and query timeouts. QueryWise physically cannot write."],
  ["Do I need to know SQL?", "No — you ask in plain English. But the generated SQL is always shown and explained, so analysts can verify every answer and learn from it."],
  ["What happens when the AI gets it wrong?", "You see the SQL and the row counts, so wrong answers are visible rather than silent. Rephrase or correct in a follow-up — the conversation keeps context."],
  ["What's free vs Pro?", "Free is for trying QueryWise: 25 questions a month (5 a day), one connection, one dashboard, and one open public share link (no password). Pro (coming soon) raises the question limits, adds multi-DB workspaces, password-protected sharing, and extended agent runs for complex questions. Payments are not live yet."],
] as const;

function Faq() {
  return (
    <section id="faq" className="bg-bg px-7 py-28">
      <div className="mx-auto max-w-[760px]">
        <div data-reveal>
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">FAQ</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">Fair questions</h2>
        </div>
        <div data-reveal className="mt-10 flex flex-col gap-3">
          {FAQS.map(([q, a]) => (
            <details key={q} className="group rounded-xl border border-border bg-surface px-5 transition-colors duration-200 open:border-accent-line hover:border-border-2">
              <summary className="flex cursor-pointer select-none items-center justify-between gap-4 py-[18px] text-[15.5px] font-semibold text-text">
                {q}
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-transform duration-200 group-open:rotate-45">
                  <span className="mb-px">+</span>
                </span>
              </summary>
              <p className="m-0 pb-5 text-[14.5px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- Final CTA -------------------------------- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-bg-2 px-7 py-32 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 blur-[48px]"
        style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
      />
      <div className="relative mx-auto max-w-3xl">
        <h2 data-reveal className="m-0 font-syne text-[clamp(32px,4.4vw,54px)] font-bold leading-[1.08] tracking-[-0.02em] [text-wrap:balance]">
          Stop translating questions into SQL.
        </h2>
        <p data-reveal className="m-0 mt-4 text-[17px] leading-relaxed text-muted">
          Connect a database — or the demo — and get your first answer in under a minute.
        </p>
        <div data-reveal className="mt-8 flex justify-center">
          <Link
            href="/sign-up"
            className="group flex items-center gap-2 rounded-xl bg-accent px-8 py-4 text-base font-semibold text-accent-ink no-underline transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_var(--accent-line)] active:translate-y-0 active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
        </div>
        <p data-reveal className="m-0 mt-4 font-mono text-xs text-faint">No credit card · Free plan available · Pro coming soon</p>
      </div>
    </section>
  );
}

/* --------------------------------- Footer --------------------------------- */

function Footer() {
  return (
    <footer className="border-t border-border bg-bg px-7 pb-10 pt-14">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="assets/logo.png" alt="QueryWise" className="size-7 object-contain" />
          <span className="font-bold tracking-[-0.01em]">QueryWise</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted">
          <a href="#features" className="no-underline transition-colors hover:text-text">Features</a>
          <a href="#pricing" className="no-underline transition-colors hover:text-text">Pricing</a>
          <a href="#faq" className="no-underline transition-colors hover:text-text">FAQ</a>
          <Link href="/sign-in" className="no-underline transition-colors hover:text-text">Sign in</Link>
        </div>
        <p className="m-0 font-mono text-[11px] text-faint">© 2026 QueryWise · Ask your database anything</p>
      </div>
    </footer>
  );
}
