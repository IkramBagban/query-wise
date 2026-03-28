"use client";

import { useEffect, useState } from "react";

import type { DbConnection } from "@/types";

const SESSION_KEY = "db_connection";
const TYPE_KEY = "db_type";
const NAME_KEY = "db_name";

export function maskConnectionString(connectionString?: string): string {
  if (!connectionString) return "Demo database";
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname;
    const db = parsed.pathname.replace(/^\/+/, "") || "database";
    return `${host}/${db}`;
  } catch {
    return "Custom PostgreSQL";
  }
}

export function useConnection() {
  const [connection, setConnection] = useState<DbConnection | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        setConnection(JSON.parse(raw) as DbConnection);
      }
    } finally {
      setInitialized(true);
    }
  }, []);

  const saveConnection = (next: DbConnection | null) => {
    setConnection(next);
    if (typeof window === "undefined") return;

    if (!next) {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(TYPE_KEY);
      window.localStorage.removeItem(NAME_KEY);
      return;
    }

    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    window.localStorage.setItem(TYPE_KEY, next.type);
    window.localStorage.setItem(NAME_KEY, next.name);
  };

  return {
    connection,
    initialized,
    saveConnection,
    clearConnection: () => saveConnection(null),
    maskedConnection: maskConnectionString(connection?.connectionString),
  };
}
