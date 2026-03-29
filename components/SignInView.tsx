"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, DatabaseZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const HERO_QUERIES = [
  "Top 5 products by revenue last month",
  "Order count by day for the last 30 days",
  "Customers with >10 orders and no reviews",
  "Revenue by category, quarter-over-quarter",
  "Average order value by customer segment",
];

export function SignInView() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem("llm_provider")) {
      window.localStorage.setItem("llm_provider", JSON.stringify("google"));
    }
    if (!window.localStorage.getItem("llm_model")) {
      window.localStorage.setItem("llm_model", JSON.stringify("gemini-2.5-flash"));
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % HERO_QUERIES.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  const rotating = useMemo(() => HERO_QUERIES[index], [index]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const body = (await response.json().catch(() => null)) as { error?: string; success?: boolean } | null;
      if (!response.ok || !body?.success) {
        throw new Error(body?.error ?? "Login failed");
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_0%_0%,rgba(46,213,46,0.22),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(46,213,46,0.14),transparent_26%),#f4faf2] text-[#09110a]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(23,65,40,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(23,65,40,0.2)_1px,transparent_1px)] [background-size:26px_26px]" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1240px] grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-12 lg:items-center lg:gap-8 lg:px-10 lg:py-8">
        <section className="animate-fade-in lg:col-span-7">
          <div className="mb-6 flex items-center justify-between">
            <p className="font-syne text-3xl font-bold tracking-tight">
              Query<span className="text-[#2ed52e]">Wise</span>
            </p>
            <p className="hidden rounded-full border border-[#174128]/20 bg-white px-3 py-1 text-xs font-semibold text-[#234730] md:block">
              Conversational BI
            </p>
          </div>

          <h1 className="max-w-xl font-syne text-2xl font-bold leading-[1.1] tracking-tight sm:text-3xl xl:text-4xl">
            Analyze your PostgreSQL data with natural language, charts, and shareable dashboards.
          </h1>

          <p className="mt-4 max-w-lg text-base text-[#2f4938] sm:text-lg">
            Connect a database, ask a question, and get SQL plus visual answers in seconds.
            Built for fast exploration and presentation-ready insights.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl border-[#174128]/18 !bg-white p-5 shadow-[0_18px_36px_rgba(14,41,24,0.12)]">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e9ffe7] text-[#1d8d2f]">
                <DatabaseZap className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2f7a3f]">Connect & Inspect</p>
              <p className="mt-2 text-sm leading-relaxed text-[#2f4938]">
                Load demo data or your own database schema with one flow.
              </p>
            </Card>

            <Card className="rounded-2xl border-[#174128]/18 !bg-white p-5 shadow-[0_18px_36px_rgba(14,41,24,0.12)]">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#e9ffe7] text-[#1d8d2f]">
                <BarChart3 className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2f7a3f]">Visual Answers</p>
              <div className="mt-2 h-10 overflow-hidden">
                <p className="animate-slide-up text-sm font-semibold text-[#0c150f]">{rotating}</p>
              </div>
            </Card>
          </div>
        </section>

        <section className="animate-fade-in lg:col-span-5 lg:pl-2">
          <Card
            className={`min-h-[430px] rounded-[28px] border-[#174128]/20 !bg-white p-6 shadow-[0_30px_80px_rgba(14,41,24,0.16)] sm:p-8 ${shake ? "animate-pulse border-danger/50" : ""}`}
          >
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2f7a3f]">Welcome back</p>
              <h2 className="mt-2 font-syne text-3xl font-bold tracking-tight text-[#0a110b]">Sign in</h2>
              <p className="mt-1 text-sm text-[#355140]">Use your account to continue.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <Input
                  label="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 rounded-xl border-[#123823]/20 !bg-[#ffffff] text-[#0a110b] focus:border-[#2ed52e] focus:ring-[#9be970]"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={error || undefined}
                  className="h-11 rounded-xl border-[#123823]/20 !bg-[#ffffff] text-[#0a110b] focus:border-[#2ed52e] focus:ring-[#9be970]"
                />
              </div>

              <Button
                type="submit"
                className="h-12 w-full rounded-xl border border-[#0e2a1b] bg-[#2ed52e] text-base font-semibold !text-white shadow-[0_16px_35px_rgba(46,213,46,0.34)] transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
                loading={loading}
              >
                Sign in to QueryWise
              </Button>
            </form>
          </Card>
        </section>
      </div>
    </main>
  );
}

