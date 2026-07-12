"use client";

import Link from "next/link";
import { ExternalLink, KeyRound, ShieldCheck, UserCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export function SettingsView() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Preferences" title="Settings" description="Manage account access and LLM controls." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-syne text-lg font-semibold">
              <UserCircle2 className="h-5 w-5 text-accent-strong" />
              Account center
            </h2>
            <p className="mt-2 text-sm text-faint">
              Open your profile, plan, and account settings from one place.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/profile" className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:border-accent-line hover:bg-surface-2">
                <span>Profile</span>
                <ExternalLink className="size-4 text-faint" />
              </Link>
              <Link href="/plan" className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium transition hover:border-accent-line hover:bg-surface-2">
                <span>Plan &amp; usage</span>
                <ExternalLink className="size-4 text-faint" />
              </Link>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-syne text-lg font-semibold">
              <KeyRound className="h-5 w-5 text-accent-strong" />
              LLM configuration
            </h2>
            <p className="mt-2 text-sm text-faint">
              The AI model is configured server-side. No API key setup is required.
            </p>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-syne text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-accent-strong" />
              Security and privacy
            </h2>
            <p className="mt-2 text-sm text-faint">Saved connection credentials are never returned to this UI. Public shares expose bounded dashboard snapshots only.</p>
          </Card>
          <Link href="/connections" className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm font-medium">
            Manage connections <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
