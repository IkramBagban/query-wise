"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ResourceState";
import { useToast } from "@/hooks/useToast";
import { useApiResource } from "@/hooks";
import { dashboardsApi, type ShareLinkListItem } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { label: "Never", value: "none" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Custom date", value: "custom" },
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

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface ShareLinkCardProps {
  link: ShareLinkListItem;
  onCopy: (link: ShareLinkListItem) => void;
  onRevoke: (link: ShareLinkListItem) => void;
  onRemove: (link: ShareLinkListItem) => void;
  busy: boolean;
  copiedId: string | null;
}

function ShareLinkCard({ link, onCopy, onRevoke, onRemove, busy, copiedId }: ShareLinkCardProps) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const expired = isExpired(link.expiresAt);
  const justCopied = copiedId === link.id;

  return (
    <Card className={cn("p-4", expired && "opacity-60")}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-base" aria-hidden>
              {link.passwordProtected ? "🔒" : "🔗"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {link.passwordProtected ? "Password protected" : "Public link"}
              </p>
              {link.urlAvailable && link.url ? (
                <p
                  className="mt-0.5 max-w-xs truncate font-mono text-xs text-faint"
                  title={link.url}
                >
                  {link.url}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-warning">URL unavailable for older link</p>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-faint">
          Created {formatShortDate(link.createdAt)}
          {" · "}
          {link.viewCount} {link.viewCount === 1 ? "view" : "views"}
          {" · "}
          {link.passwordProtected ? "Password protected" : "No password"}
          {expired && link.expiresAt ? (
            <span className="ml-1 text-danger">· Expired {formatShortDate(link.expiresAt)}</span>
          ) : null}
        </p>

        {confirmRevoke ? (
          <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 p-3">
            <p className="text-xs text-muted">
              Are you sure? This link will stop working immediately.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRevoke(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                loading={busy}
                onClick={() => onRevoke(link)}
              >
                Revoke
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            {!expired && link.urlAvailable && link.url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onCopy(link)}
              >
                <Copy className="h-3.5 w-3.5" />
                {justCopied ? "Copied!" : "Copy link"}
              </Button>
            ) : null}
            {expired ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={busy}
                onClick={() => onRemove(link)}
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </Button>
            ) : (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setConfirmRevoke(true)}
              >
                Revoke
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

interface CreateShareFormProps {
  onCancel: () => void;
  onCreated: (link: ShareLinkListItem) => void;
  dashboardId: string;
}

function CreateShareForm({ onCancel, onCreated, dashboardId }: CreateShareFormProps) {
  const { pushToast } = useToast();
  const [passwordOption, setPasswordOption] = useState<"none" | "required">("none");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("none");
  const [customExpiry, setCustomExpiry] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = passwordOption === "required" && password.length > 0 && password.length < 10;
  const canSubmit =
    !creating &&
    (passwordOption === "none" || password.length >= 10) &&
    (expiry !== "custom" || Boolean(customExpiry));

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const expiresAt = expiryIso(expiry, customExpiry);
      const result = await dashboardsApi.createShare(dashboardId, {
        type: "link",
        ...(passwordOption === "required" ? { password } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });
      if (result.type === "link") {
        onCreated(result.link);
        pushToast({ title: "Link created!", variant: "success" });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create share link");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-4 text-sm font-semibold">Create share link</h3>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Password protection</p>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="password-option"
                value="none"
                checked={passwordOption === "none"}
                onChange={() => {
                  setPasswordOption("none");
                  setPassword("");
                }}
                className="h-4 w-4 accent-accent-2"
              />
              None
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="password-option"
                value="required"
                checked={passwordOption === "required"}
                onChange={() => setPasswordOption("required")}
                className="h-4 w-4 accent-accent-2"
              />
              <Lock className="h-3.5 w-3.5 text-faint" />
              Password required
            </label>
          </div>
          {passwordOption === "required" && (
            <div className="mt-3">
              <Input
                type="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
                minLength={10}
              />
              {passwordTooShort && (
                <p className="mt-1 text-xs text-danger">Password must be at least 10 characters.</p>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">Link expiry</p>
          <Select value={expiry} onChange={setExpiry} options={EXPIRY_OPTIONS} className="w-full" />
          {expiry === "custom" && (
            <div className="mt-3">
              <Input
                type="datetime-local"
                label="Custom expiry"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
              />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            loading={creating}
            disabled={!canSubmit}
            onClick={() => void handleCreate()}
          >
            Generate link →
          </Button>
        </div>
      </div>
    </Card>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function ShareDashboardModal({
  dashboardId,
  open,
  onOpenChange,
  onActiveLinksChange,
}: {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActiveLinksChange?: (hasActive: boolean) => void;
}) {
  const shares = useApiResource((signal) => dashboardsApi.shares(dashboardId, signal), dashboardId);
  const { pushToast } = useToast();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busyShareId, setBusyShareId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const links = useMemo(() => shares.data?.links ?? [], [shares.data]);
  const activeLinks = useMemo(
    () => links.filter((l) => !isExpired(l.expiresAt)),
    [links],
  );

  useEffect(() => {
    if (!shares.loading) {
      onActiveLinksChange?.(activeLinks.length > 0);
    }
  }, [activeLinks.length, shares.loading, onActiveLinksChange]);

  async function copyLink(link: ShareLinkListItem) {
    if (!link.url) return;
    await navigator.clipboard.writeText(link.url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function revokeLink(link: ShareLinkListItem) {
    setBusyShareId(link.id);
    try {
      await dashboardsApi.revokeShare(dashboardId, link.id);
      shares.setData((current) => ({
        links: (current?.links ?? []).filter((l) => l.id !== link.id),
        grants: current?.grants ?? [],
      }));
    } catch (reason) {
      pushToast({
        title: reason instanceof Error ? reason.message : "Unable to revoke link",
        variant: "error",
      });
    } finally {
      setBusyShareId(null);
    }
  }

  function handleCreated(newLink: ShareLinkListItem) {
    shares.setData((current) => ({
      links: [newLink, ...(current?.links ?? [])],
      grants: current?.grants ?? [],
    }));
    setShowCreateForm(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      panelClassName="max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-syne text-xl font-semibold">Share dashboard</h2>
            <p className="mt-1 text-sm text-faint">
              Generate public links — no login required for viewers.
            </p>
          </div>
          {!showCreateForm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create new link
            </Button>
          )}
        </div>

        {showCreateForm && (
          <CreateShareForm
            dashboardId={dashboardId}
            onCancel={() => setShowCreateForm(false)}
            onCreated={handleCreated}
          />
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">Active share links</h3>
          {shares.loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : shares.error ? (
            <ErrorState error={shares.error} onRetry={() => void shares.refresh()} />
          ) : links.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-2 bg-surface p-10 text-center">
              <Link2 className="h-7 w-7 text-faint" />
              <p className="mt-3 font-medium">No active share links</p>
              <p className="mt-1 text-sm text-faint">
                Share this dashboard with anyone — no login required.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateForm(true)}
              >
                Create your first link →
              </Button>
            </div>
          ) : (
            links.map((link) => (
              <ShareLinkCard
                key={link.id}
                link={link}
                busy={busyShareId === link.id}
                copiedId={copiedId}
                onCopy={(l) => void copyLink(l)}
                onRevoke={(l) => void revokeLink(l)}
                onRemove={(l) => void revokeLink(l)}
              />
            ))
          )}
        </div>

        {activeLinks.length > 0 && (
          <p className="text-xs text-faint">
            Anyone with these links can view data from your connected databases.
          </p>
        )}
      </div>
    </Dialog>
  );
}
