"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("querywise2024");
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
      window.localStorage.setItem("llm_model", JSON.stringify("gemini-1.5-flash"));
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

      router.push("/workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setShake(true);
      window.setTimeout(() => setShake(false), 350);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="signin-grid relative min-h-screen overflow-hidden bg-[#f7fbf6] text-[#09110a]">
      <div className="signin-orb signin-orb-left" />
      <div className="signin-orb signin-orb-right" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1280px] grid-cols-1 gap-8 px-5 py-8 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:px-12 lg:py-10">
        <section className="animate-fade-in lg:col-span-7 lg:pt-6">
          <div className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              
              <p className="font-syne text-3xl font-bold tracking-tight">
                Query<span className="text-[#2ed52e]">Wise</span>
              </p>
            </div>
            <p className="hidden rounded-full border border-[#113620]/20 bg-white px-3 py-1 text-xs font-medium text-[#113620]/80 md:block">
              Conversational BI
            </p>
          </div>

          <p className="mb-4 inline-flex w-fit items-center rounded-full border border-[#79c75f]/55 bg-[#ebfddf] px-4 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1f5b2d]">
            Built for speed and clarity
          </p>

          <h1 className="font-syne text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl xl:text-6xl">
            Sign in to your
            <br />
              <span className="text-[#0a0f0a]">AI analyst workspace</span>
            </h1>

          <p className="mt-5 max-w-2xl text-base text-[#2e4134] sm:text-lg">
            Connect your PostgreSQL data and ask natural language questions. QueryWise writes the SQL, returns results, and
            visualizes trends in seconds.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl border-[#173a27] !bg-[#102318] p-5 shadow-[0_22px_44px_rgba(9,31,19,0.28)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#95e96f]">Step 01</p>
              <p className="mt-2 font-syne text-2xl font-semibold text-white">Connect</p>
              <p className="mt-1 text-sm leading-relaxed text-white/80">Sync demo data or your own Postgres schema in one flow.</p>
            </Card>
            <Card className="rounded-2xl border-[#123823]/20 !bg-[#fafff9] p-5 shadow-[0_20px_34px_rgba(17,54,32,0.1)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2f7a3f]">Live prompt</p>
              <div className="mt-2 h-11 overflow-hidden">
                <p className="animate-slide-up text-sm font-semibold text-[#08110a]">{rotating}</p>
              </div>
              <p className="mt-1 text-sm text-[#314237]">Switch chart types, save widgets, and share dashboards quickly.</p>
            </Card>
          </div>
        </section>

        <section className="animate-fade-in lg:col-span-5 lg:pl-6">
          <Card
            className={`rounded-[28px] border-[#123823]/18 !bg-white p-6 shadow-[0_32px_84px_rgba(18,56,35,0.18)] sm:p-8 ${
              shake ? "animate-pulse border-danger/50" : ""
            }`}
          >
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2f7a3f]">Welcome back</p>
              <h2 className="mt-2 font-syne text-3xl font-bold tracking-tight text-[#0a110b]">Sign in</h2>
              <p className="mt-1 text-sm text-[#355140]">Use demo credentials to continue.</p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <Input
                  label="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 rounded-xl border-[#123823]/20 !bg-[#ffffff] text-[#0a110b] focus:border-[#328949] focus:ring-[#9be970]"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={error || undefined}
                  className="h-11 rounded-xl border-[#123823]/20 !bg-[#ffffff] text-[#0a110b] focus:border-[#328949] focus:ring-[#9be970]"
                />
              </div>

              <Button
                type="submit"
                className="signin-cta h-12 w-full rounded-xl border border-[#0e2a1b] text-base font-semibold text-white shadow-[0_16px_35px_rgba(59,146,70,0.34)] transition-all hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
                loading={loading}
              >
                Continue to Workspace
              </Button>
            </form>

            <div className="mt-7 rounded-2xl border border-[#123823]/18 bg-[#f4fff1] p-4">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#2f7a3f]">Demo credentials</p>
              <p className="flex justify-between font-mono text-xs text-[#2d4135]">
                <span>
                  user: <span className="font-semibold text-[#0a110b]">demo</span>
                </span>
                <span>
                  pass: <span className="font-semibold text-[#0a110b]">querywise2024</span>
                </span>
              </p>
            </div>
          </Card>
        </section>
      </div>
    </main>

  );
}
