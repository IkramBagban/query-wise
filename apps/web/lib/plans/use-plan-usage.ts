"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlanUsageDto } from "./dto";

export type { PlanUsageDto } from "./dto";

interface PlanUsageState {
  data: PlanUsageDto | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Client hook for GET /api/me/plan. Powers in-app usage meters and feature gates
 * (e.g. hiding the password-share control on Free). Read-only; never mutates plan.
 */
export function usePlanUsage(): PlanUsageState {
  const [data, setData] = useState<PlanUsageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/me/plan", { headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load plan (${response.status})`);
        return (await response.json()) as PlanUsageDto;
      })
      .then((dto) => {
        if (!cancelled) setData(dto);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load plan");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { data, loading, error, refresh };
}
