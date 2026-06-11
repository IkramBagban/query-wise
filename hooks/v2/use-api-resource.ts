"use client";

import { useCallback, useEffect, useState } from "react";

export function useApiResource<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Request failed"));
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, loading, refresh, setData };
}
