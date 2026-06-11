"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/v2/PageHeader";
import { UserControl } from "@/components/v2/auth/UserControl";

export function SettingsView() {
  const [provider, setProvider] = useState("google"); const [model, setModel] = useState(""); const [apiKey, setApiKey] = useState(""); const [saved, setSaved] = useState(false);
  useEffect(() => { setProvider(localStorage.getItem("querywise.v2.llmProvider") ?? "google"); setModel(localStorage.getItem("querywise.v2.llmModel") ?? ""); setApiKey(localStorage.getItem("querywise.v2.llmApiKey") ?? ""); }, []);
  function save(event: FormEvent) { event.preventDefault(); localStorage.setItem("querywise.v2.llmProvider", provider); localStorage.setItem("querywise.v2.llmModel", model); localStorage.setItem("querywise.v2.llmApiKey", apiKey); setSaved(true); window.setTimeout(() => setSaved(false), 1500); }
  return <div className="space-y-6"><PageHeader eyebrow="Preferences" title="Settings" description="Manage account access and browser-session LLM controls." /><div className="grid gap-4 lg:grid-cols-2"><Card className="p-5"><h2 className="flex items-center gap-2 font-syne text-lg font-semibold"><KeyRound className="h-5 w-5 text-accent-2" />LLM controls</h2><p className="mt-1 text-xs text-text-3">API keys are stored in this browser only and sent with query requests. They are not persisted by V2 services.</p><form onSubmit={save} className="mt-4 space-y-3"><Select className="w-full" value={provider} onChange={setProvider} options={[{ value: "google", label: "Google" }, { value: "anthropic", label: "Anthropic" }]} /><Input required label="Model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model identifier" /><Input required type="password" label="API key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" /><Button type="submit">{saved ? "Saved" : "Save controls"}</Button></form></Card><div className="space-y-4"><Card className="p-5"><h2 className="font-syne text-lg font-semibold">Account</h2><div className="mt-4"><UserControl /></div></Card><Card className="p-5"><h2 className="flex items-center gap-2 font-syne text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-accent-2" />Security and privacy</h2><p className="mt-2 text-sm text-text-3">Saved connection credentials are never returned to this UI. Public shares expose bounded dashboard snapshots only.</p></Card><Link href="/connections" className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm font-medium">Manage connections <ExternalLink className="h-4 w-4" /></Link></div></div></div>;
}
