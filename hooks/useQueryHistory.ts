"use client";

import { useCallback, useEffect, useState } from "react";

import { QUERY_HISTORY_KEY } from "@/store/app-state/constants";
import type { QueryHistoryEntry } from "@/types";

const MAX_ENTRIES = 100;

function readFromStorage(): QueryHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUERY_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as QueryHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeToStorage(entries: QueryHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(entries));
}

export function useQueryHistory() {
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(readFromStorage());
  }, []);

  const addEntry = useCallback((entry: QueryHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
      writeToStorage(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    writeToStorage([]);
  }, []);

  return { history, addEntry, removeEntry, clearHistory };
}
