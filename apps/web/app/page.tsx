"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
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
    q: "Show monthly revenue for the last 12 months",
    sql: "SELECT date_trunc('month', o.created_at) AS month,\n       SUM(o.total_amount) AS revenue\nFROM orders o\nWHERE o.created_at >= now() - interval '12 months'\nGROUP BY 1 ORDER BY 1;",
    chartTitle: "Monthly revenue",
    chartMeta: "12 rows · bar chart (auto)",
    labels: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    values: [34, 41, 38, 52, 47, 58, 55, 63, 60, 72, 69, 84],
    peakLabel: "$84k",
    widget: "Saved as widget to 'Company KPIs' dashboard",
  },
  {
    q: "Which products sold the most last quarter?",
    sql: "SELECT p.name, SUM(oi.quantity) AS units_sold\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nWHERE oi.created_at >= now() - interval '3 months'\nGROUP BY p.name\nORDER BY units_sold DESC LIMIT 5;",
    chartTitle: "Top products by units sold",
    chartMeta: "5 rows · bar chart (auto)",
    labels: ["Trail Pack", "Aero Bottle", "Flux Mat", "Core Tee", "Ridge Cap"],
    values: [88, 71, 64, 52, 40],
    peakLabel: "4.2k",
    widget: "Saved as widget to 'Sales' dashboard",
  },
  {
    q: "How many new customers signed up each week?",
    sql: "SELECT date_trunc('week', created_at) AS week,\n       COUNT(*) AS signups\nFROM customers\nWHERE created_at >= now() - interval '8 weeks'\nGROUP BY 1 ORDER BY 1;",
    chartTitle: "Weekly customer signups",
    chartMeta: "8 rows · bar chart (auto)",
    labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
    values: [30, 42, 38, 55, 61, 58, 74, 82],
    peakLabel: "82",
    widget: "Saved as widget to 'Growth' dashboard",
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
  const maxIdx = ex.values.indexOf(Math.max(...ex.values));
  const sqlDone = demo.sqlShown >= sqlTokens.length;

  return (
    <div className="mt-16 w-full max-w-[880px] text-left" style={{ animation: "qw-rise 0.7s cubic-bezier(0.16,1,0.3,1) 0.65s both" }}>
      {/* example chips */}
      <div className="mb-4 flex flex-wrap justify-center gap-2.5">
        {EXAMPLES.map((example, i) => {
          const on = i === demo.exIdx;
          return (
            <button
              key={example.q}
              type="button"
              onClick={() => demo.select(i)}
              className={`rounded-full border px-3.5 py-2 font-mono text-[12.5px] transition-all duration-200 active:scale-[0.96] ${
                on ? "border-accent-line bg-accent-soft text-accent-strong" : "border-border bg-surface text-muted hover:border-accent-line hover:text-text"
              }`}
            >
              {example.q}
            </button>
          );
        })}
      </div>

      {/* browser frame */}
      <div className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),var(--shadow)]">
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-[18px] py-3">
          <span className="size-[11px] rounded-full bg-[#F26D6D]" />
          <span className="size-[11px] rounded-full bg-[#F2C36D]" />
          <span className="size-[11px] rounded-full bg-[#5FCB7E]" />
          <span className="ml-2.5 flex items-center gap-1.5 font-mono text-xs text-faint">
            <Lock className="size-3" strokeWidth={1.75} />
            querywise.app — acme_analytics (read-only)
          </span>
        </div>

        <div className="flex h-[640px] flex-col gap-4 overflow-hidden p-6 sm:p-7">
          {/* user bubble */}
          <div className="flex justify-end">
            <div className="min-h-[46px] max-w-[80%] rounded-[14px] rounded-br-md border border-accent-line bg-accent-soft px-[18px] py-3 text-[15.5px] text-text">
              {demo.typed}
              {demo.isTyping ? <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-accent" style={{ animation: "qw-blink 0.9s step-end infinite" }} /> : null}
            </div>
          </div>

          {/* pipeline */}
          {demo.stepIdx >= 0 ? (
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2" style={{ animation: "qw-fadeup 0.4s ease both" }}>
              {STEP_LABELS.map((label, i) => {
                const done = demo.stepIdx > i;
                const active = demo.stepIdx === i;
                return (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 font-mono text-[11.5px] tracking-[0.03em] transition-colors duration-300"
                    style={{ color: done ? "var(--accent)" : active ? "var(--text)" : "var(--faint)" }}
                  >
                    <span
                      className="size-[7px] rounded-full transition-colors duration-300"
                      style={{ background: done || active ? "var(--accent)" : "var(--border2)", animation: active ? "qw-pulse 1s ease-in-out infinite" : "none" }}
                    />
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}

          {/* SQL card — streams token by token */}
          {demo.sqlShown > 0 ? (
            <div className="rounded-xl border border-border bg-code-bg px-5 py-4" style={{ animation: "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both" }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Generated SQL</span>
                {sqlDone ? (
                  <span className="rounded-full border border-accent-line px-2.5 py-0.5 font-mono text-[11px] text-accent-strong" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
                    ✓ read-only
                  </span>
                ) : (
                  <span className="font-mono text-[11px] text-faint">writing…</span>
                )}
              </div>
              <pre className="m-0 whitespace-pre-wrap font-mono text-[13px] leading-[1.75]">
                {sqlTokens.slice(0, demo.sqlShown).map((token, i) => (
                  <span key={i} style={{ color: token.color }}>{token.text}</span>
                ))}
                {!sqlDone ? <span className="ml-0.5 inline-block h-3.5 w-0.5 bg-accent align-middle" style={{ animation: "qw-blink 0.9s step-end infinite" }} /> : null}
              </pre>
            </div>
          ) : null}

          {/* chart card — staggered bar growth + counting peak label */}
          {demo.showChart ? (
            <div className="rounded-xl border border-border bg-surface-2 px-5 py-[18px]" style={{ animation: "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both" }}>
              <div className="mb-4 flex items-baseline justify-between">
                <span className="text-sm font-semibold">{ex.chartTitle}</span>
                <span className="font-mono text-[11px] text-faint">{ex.chartMeta}</span>
              </div>
              <div className="flex h-[150px] items-end gap-2">
                {ex.labels.map((label, i) => (
                  <div key={label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
                    {i === maxIdx ? (
                      <span className={`-mb-0.5 text-center font-mono text-[10px] font-semibold tabular-nums text-accent-strong transition-opacity duration-300 ${demo.grown ? "opacity-100" : "opacity-0"}`}>
                        <CountUp target={ex.peakLabel} active={demo.grown} />
                      </span>
                    ) : null}
                    <div
                      className="min-h-[3px] rounded-t-[5px] rounded-b-sm bg-gradient-to-b from-accent-strong to-accent"
                      style={{ height: demo.grown ? `${ex.values[i]}%` : "3%", transition: `height 0.7s cubic-bezier(0.22,1,0.36,1) ${i * 28}ms` }}
                    />
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-center font-mono text-[9.5px] text-faint">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* saved-to-dashboard confirmation */}
          {demo.showWidget ? (
            <div className="flex items-center gap-3 rounded-xl border border-accent-line bg-accent-soft px-[18px] py-3" style={{ animation: "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both" }}>
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <span className="text-sm text-text">{ex.widget}</span>
              <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-accent-strong">↻ auto-refresh on</span>
            </div>
          ) : null}
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

const USE_CASES = [
  { icon: TrendingUp, title: "Sales analytics", line: "Pipeline, quota, win rates — without waiting on ops.", q: "How did each region perform against quota this quarter?" },
  { icon: Users, title: "Customer insights", line: "Cohorts, retention, and growth in plain English.", q: "Which customers are at risk of churning this month?" },
  { icon: Package, title: "Inventory", line: "Stock levels and velocity, straight from the source.", q: "What's running low in the warehouse right now?" },
  { icon: Landmark, title: "Finance", line: "Revenue, margins, and burn — no spreadsheet exports.", q: "Show gross margin by product line, month over month." },
  { icon: Megaphone, title: "Marketing", line: "Campaign performance and attribution on demand.", q: "Which campaign drove the most signups per dollar?" },
  { icon: Truck, title: "Operations", line: "Fulfillment, SLAs, and throughput at a glance.", q: "What's our average delivery time by city this week?" },
];

function UseCases() {
  return (
    <section className="bg-bg px-7 py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="max-w-2xl">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Use cases</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">
            One question away, whatever the team
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map(({ icon: Icon, title, line, q }, i) => (
            <div
              key={title}
              data-reveal
              className="group rounded-2xl border border-border bg-surface p-6 transition-all duration-200 hover:-translate-y-1 hover:border-accent-line"
              style={{ transitionDelay: `${(i % 3) * 0.06}s` }}
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent-soft">
                <Icon className="size-[18px] text-accent-strong" strokeWidth={1.75} />
              </div>
              <h3 className="m-0 text-[17px] font-semibold">{title}</h3>
              <p className="m-0 mt-1.5 text-sm leading-relaxed text-muted">{line}</p>
              <p className="m-0 mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[11.5px] text-faint transition-colors duration-200 group-hover:border-accent-line group-hover:text-muted">
                “{q}”
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- Pricing -------------------------------- */

function Pricing() {
  const included = ["Unlimited questions", "PostgreSQL connections", "Auto-charts & dashboards", "Secure public sharing", "Read-only safety, always on"];
  return (
    <section id="pricing" className="border-y border-border bg-bg-2 px-7 py-28">
      <div className="mx-auto max-w-[1180px]">
        <div data-reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Pricing</p>
          <h2 className="font-syne text-[clamp(32px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.015em]">Free while in beta</h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-muted">
            Every feature, generous limits, no credit card. Paid plans arrive later — beta users get grandfathered perks.
          </p>
        </div>
        <div data-reveal className="mx-auto mt-12 max-w-md rounded-3xl border border-accent-line bg-surface p-8 text-center shadow-[0_0_60px_-30px_var(--accent)]">
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-strong">Beta</p>
          <p className="m-0 mt-3 font-syne text-6xl font-bold">$0</p>
          <p className="m-0 mt-1 text-sm text-faint">while in beta</p>
          <ul className="m-0 mt-7 flex list-none flex-col gap-3 p-0 text-left">
            {included.map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-text">
                <Check className="size-4 shrink-0 text-accent-strong" strokeWidth={2.5} />
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/sign-up"
            className="mt-8 block rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-ink no-underline transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_var(--accent-line)]"
          >
            Start free →
          </Link>
        </div>
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
        <p data-reveal className="m-0 mt-4 font-mono text-xs text-faint">No credit card · Free while in beta</p>
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
