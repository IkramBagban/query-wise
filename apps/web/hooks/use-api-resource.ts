"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { V2ApiError } from "@/lib/api-client";

type ApiResourceLoader<T> = (signal: AbortSignal) => Promise<T>;

export function useApiResource<T>(loader: ApiResourceLoader<T>, dependencyKey?: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const activeResolversRef = useRef<Array<() => void>>([]);
  const queuedResolversRef = useRef<Array<() => void>>([]);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const runLoad = useEffectEvent(async (
    controller: AbortController,
    generation: number,
    resolvers: Array<() => void>,
  ) => {
    setLoading(true);
    setError(null);
    try {
      let nextData: T;
      try {
        nextData = await loader(controller.signal);
      } catch (reason) {
        // Retry once on 401 — Clerk's session token may not be ready on first render
        if (reason instanceof V2ApiError && reason.status === 401 && !controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          nextData = await loader(controller.signal);
        } else {
          throw reason;
        }
      }
      if (generation === generationRef.current && !controller.signal.aborted) {
        setData(nextData);
      }
    } catch (reason) {
      if (generation === generationRef.current && !controller.signal.aborted) {
        setError(reason instanceof Error ? reason : new Error("Request failed"));
      }
    } finally {
      if (generation === generationRef.current && !controller.signal.aborted) {
        setLoading(false);
        controllerRef.current = null;
      }
      activeResolversRef.current = activeResolversRef.current.filter(
        (resolve) => !resolvers.includes(resolve),
      );
      resolvers.forEach((resolve) => resolve());
    }
  });

  const refresh = useCallback(() => {
    return new Promise<void>((resolve) => {
      queuedResolversRef.current.push(resolve);
      setRefreshIndex((index) => index + 1);
    });
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const resolvers = queuedResolversRef.current.splice(0);
    activeResolversRef.current.push(...resolvers);
    void runLoad(controller, generation, resolvers);

    return () => {
      generationRef.current += 1;
      controller.abort();
    };
  }, [dependencyKey, refreshIndex]);

  useEffect(() => () => {
    const resolvers = [...activeResolversRef.current, ...queuedResolversRef.current];
    activeResolversRef.current = [];
    queuedResolversRef.current = [];
    resolvers.forEach((resolve) => resolve());
    controllerRef.current = null;
  }, []);

  return { data, error, loading, refresh, setData };
}
