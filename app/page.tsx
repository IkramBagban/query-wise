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
    <main className="relative grid min-h-screen overflow-hidden bg-bg/95 lg:grid-cols-5">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" />
      <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-accent/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-96 w-96 rounded-full bg-accent-2/10 blur-[120px]" />

      <section className="relative z-10 flex flex-col justify-center gap-6 px-8 py-12 lg:col-span-3 lg:px-20">
        <div className="animate-fade-in space-y-2">
          <p className="inline-block rounded-full bg-accent-dim px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Conversational BI platform
          </p>
          <h1 className="font-syne text-6xl font-bold leading-[1.1] tracking-tight text-gradient xl:text-7xl">
            Ask your database <br /> anything.
          </h1>
        </div>
        
        <p className="max-w-xl animate-slide-up text-lg leading-relaxed text-text-2">
          Connect your PostgreSQL database and query it in plain English. 
          Generate insights, charts, and reports 10x faster with AI.
        </p>

        <Card className="glass max-w-xl animate-fade-in border-white/5 p-5 shadow-2xl transition-all duration-300 hover:border-white/10">
          <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-text-3 font-semibold">Live examples</p>
          <div className="h-6 overflow-hidden">
             <p className="animate-slide-up text-sm font-medium text-text-1">{rotating}</p>
          </div>
        </Card>
      </section>

      <section className="relative z-10 flex items-center justify-center bg-surface/30 px-6 py-10 backdrop-blur-sm lg:col-span-2 lg:px-12 border-l border-white/5">
        <div className="w-full max-w-md animate-fade-in">
          <Card className={`glass border-white/10 p-8 shadow-2xl ${shake ? "animate-pulse border-danger/40" : ""}`}>
            <div className="mb-8">
              <h2 className="font-syne text-3xl font-bold text-text-1">Sign in</h2>
              <p className="text-sm text-text-2">Use demo credentials to continue.</p>
            </div>
            
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <Input 
                  label="Username" 
                  value={username} 
                  onChange={(event) => setUsername(event.target.value)} 
                  className="bg-surface-2/50 border-white/5 focus:border-accent/50"
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={error || undefined}
                  className="bg-surface-2/50 border-white/5 focus:border-accent/50"
                />
              </div>
              
              <Button type="submit" className="w-full h-11 text-base font-semibold shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98]" loading={loading}>
                Continue to Workspace
              </Button>
            </form>
            
            <div className="mt-8 rounded-lg bg-surface-2/40 p-3 border border-white/5">
              <p className="text-[10px] uppercase tracking-wider text-text-3 font-bold mb-1">Demo credentials</p>
              <p className="font-mono text-xs text-text-2 flex justify-between">
                <span>user: <span className="text-text-1">demo</span></span>
                <span>pass: <span className="text-text-1">querywise2024</span></span>
              </p>
            </div>
          </Card>
        </div>
      </section>
    </main>

  );
}
