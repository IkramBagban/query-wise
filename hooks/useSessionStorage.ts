"use client";

import { useEffect, useState } from "react";

export function useSessionStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      } else {
        window.sessionStorage.setItem(key, JSON.stringify(fallback));
      }
    } catch {
      setValue(fallback);
    } finally {
      setInitialized(true);
    }
  }, [fallback, key]);

  const updateValue = (next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = next instanceof Function ? next(prev) : next;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(key, JSON.stringify(resolved));
      }
      return resolved;
    });
  };

  return { value, setValue: updateValue, initialized };
}


