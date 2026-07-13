"use client";

import { useEffect, useState, useTransition } from "react";
import { recordDebugViewOpenedAction } from "@/lib/actions/admin-actions";

const storageKey = (runId: string) => `admin.debug.ack.${runId}`;

/**
 * Interstitial before showing user content (SPEC-08 §5.4).
 * First open per run per browser session requires confirmation; every open
 * writes admin.debug_view.opened.
 */
export function DebugGate({
  queryRunId,
  targetUserId,
  children,
}: {
  queryRunId: string;
  targetUserId: string;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const ack = sessionStorage.getItem(storageKey(queryRunId));
      if (ack === "1") {
        // Already acknowledged this session — still audit every open.
        startTransition(async () => {
          const result = await recordDebugViewOpenedAction({
            queryRunId,
            targetUserId,
          });
          if (!result.ok) {
            setError(
              ("error" in result && result.error) || "Could not log access.",
            );
          }
          setConfirmed(true);
          setReady(true);
        });
      } else {
        setReady(true);
      }
    } catch {
      setReady(true);
    }
  }, [queryRunId, targetUserId]);

  function acknowledge() {
    setError(null);
    startTransition(async () => {
      const result = await recordDebugViewOpenedAction({
        queryRunId,
        targetUserId,
      });
      if (!result.ok) {
        setError(("error" in result && result.error) || "Could not log access.");
        return;
      }
      try {
        sessionStorage.setItem(storageKey(queryRunId), "1");
      } catch {
        /* ignore */
      }
      setConfirmed(true);
    });
  }

  if (!ready || pending && !confirmed) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Preparing debug view…
      </div>
    );
  }

  if (!confirmed) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-500/40 bg-card p-8 text-center">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-amber-300/80">
          Content gate
        </p>
        <h1 className="mb-3 text-lg font-semibold text-foreground">
          You are about to view user content
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
          This access is logged. Question text and generated SQL will be visible.
          Result rows and credentials are never shown.
        </p>
        {error ? (
          <p className="mb-4 text-sm text-danger">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={acknowledge}
          className="rounded-md bg-amber-500/90 px-4 py-2 text-sm font-medium text-black"
        >
          Continue — log this access
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
