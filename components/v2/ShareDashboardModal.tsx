"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Eye, Link2, Lock, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/v2/ResourceState";
import { useToast } from "@/hooks/useToast";
import { useApiResource } from "@/hooks/v2";
import { dashboardsApi, type ShareLinkListItem } from "@/lib/v2/api-client";
import { formatRelativeTime } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { label: "None", value: "none" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Custom", value: "custom" },
];

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function expiryIso(option: string, customValue: string): string | undefined {
  if (option === "7d") return addDays(7);
  if (option === "30d") return addDays(30);
  if (option === "custom" && customValue) return new Date(customValue).toISOString();
  return undefined;
}

function formatExpiry(value: string | null): string {
  if (!value) return "No expiry";
  return `Expires ${new Date(value).toLocaleString()}`;
}

function ShareLinkRow({
  link,
  onCopy,
  onRevoke,
  busy,
}: {
  link: ShareLinkListItem;
  onCopy: (link: ShareLinkListItem) => void;
  onRevoke: (link: ShareLinkListItem) => void;
  busy: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Link2 className="h-4 w-4 text-accent-2" />
            Public dashboard link
            {link.passwordProtected ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-text-3">
                <Lock className="h-3 w-3" />
                Password
              </span>
            ) : null}
          </div>
          {link.urlAvailable && link.url ? (
            <p className="mt-1 truncate font-mono text-xs text-text-3">{link.url}</p>
          ) : (
            <p className="mt-1 text-xs text-warning">URL unavailable for older link</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {link.viewCount} views
            </span>
            <span>Created {formatRelativeTime(link.createdAt)}</span>
            <span>{formatExpiry(link.expiresAt)}</span>
            {link.lastViewedAt ? <span>Last viewed {formatRelativeTime(link.lastViewedAt)}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!link.urlAvailable || !link.url}
            onClick={() => onCopy(link)}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={busy}
            onClick={() => onRevoke(link)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Revoke
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ShareDashboardModal({
  dashboardId,
  open,
  onOpenChange,
}: {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shares = useApiResource(() => dashboardsApi.shares(dashboardId), [dashboardId]);
  const { pushToast } = useToast();
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("none");
  const [customExpiry, setCustomExpiry] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ShareLinkListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const links = useMemo(() => shares.data?.links ?? [], [shares.data]);

  async function createLink() {
    setCreating(true);
    setError(null);
    try {
      const expiresAt = expiryIso(expiry, customExpiry);
      const result = await dashboardsApi.createShare(dashboardId, {
        type: "link",
        ...(passwordEnabled ? { password } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });
      if (result.type === "link") {
        shares.setData((current) => ({
          links: [result.link, ...(current?.links ?? [])],
          grants: current?.grants ?? [],
        }));
        setPassword("");
        setPasswordEnabled(false);
        setExpiry("none");
        setCustomExpiry("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create share link");
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(link: ShareLinkListItem) {
    if (!link.url) return;
    await navigator.clipboard.writeText(link.url);
    pushToast({ title: "Link copied!", variant: "success" });
  }

  async function revokeLink() {
    if (!pendingRevoke) return;
    setBusyShareId(pendingRevoke.id);
    setError(null);
    try {
      await dashboardsApi.revokeShare(dashboardId, pendingRevoke.id);
      shares.setData((current) => ({
        links: (current?.links ?? []).filter((link) => link.id !== pendingRevoke.id),
        grants: current?.grants ?? [],
      }));
      setPendingRevoke(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke share link");
    } finally {
      setBusyShareId(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} panelClassName="max-h-[90vh] max-w-3xl overflow-y-auto">
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="font-syne text-xl font-semibold">Share dashboard</h2>
            <p className="mt-1 text-sm text-text-3">
              Generate public links, copy active URLs, and revoke access immediately.
            </p>
          </div>

          <Card className="border-warning/30 bg-warning/10 p-3">
            <p className="flex items-start gap-2 text-sm text-text-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              Anyone with this link can see data from your connected databases.
            </p>
          </Card>

          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-text-2">
                <input
                  type="checkbox"
                  checked={passwordEnabled}
                  onChange={(event) => setPasswordEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-border bg-surface"
                />
                Require password
              </label>
              <Select value={expiry} onChange={setExpiry} options={EXPIRY_OPTIONS} className="w-full" />
              {passwordEnabled ? (
                <Input
                  type="password"
                  minLength={10}
                  label="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 10 characters"
                />
              ) : null}
              {expiry === "custom" ? (
                <Input
                  type="datetime-local"
                  label="Custom expiry"
                  value={customExpiry}
                  onChange={(event) => setCustomExpiry(event.target.value)}
                />
              ) : null}
            </div>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <Button
              className="mt-4"
              type="button"
              loading={creating}
              disabled={(passwordEnabled && password.length < 10) || (expiry === "custom" && !customExpiry)}
              onClick={() => void createLink()}
            >
              <Link2 className="h-4 w-4" />
              Generate link
            </Button>
          </Card>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Active links</h3>
            {shares.loading ? (
              <LoadingState label="Loading share links" />
            ) : shares.error ? (
              <ErrorState error={shares.error} onRetry={() => void shares.refresh()} />
            ) : links.length === 0 ? (
              <EmptyState title="No share links yet" description="Generate a link to share this dashboard publicly." />
            ) : (
              links.map((link) => (
                <ShareLinkRow
                  key={link.id}
                  link={link}
                  busy={busyShareId === link.id}
                  onCopy={(item) => void copyLink(item)}
                  onRevoke={setPendingRevoke}
                />
              ))
            )}
          </div>
        </div>
      </Dialog>

      <Dialog open={Boolean(pendingRevoke)} onOpenChange={(value) => !value && setPendingRevoke(null)} panelClassName="max-w-md">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-syne text-lg font-semibold">Revoke share link?</h2>
            <p className="mt-1 text-sm text-text-3">
              Are you sure? This link will stop working immediately.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPendingRevoke(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={Boolean(busyShareId)} onClick={() => void revokeLink()}>
              Revoke
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
