"use client";

import { useMemo, useState } from "react";
import { Database, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import type { CanonicalDataSourceMetadata } from "@query-wise/shared/types";

export function SchemaBrowser({ metadata }: { metadata: CanonicalDataSourceMetadata | null }) {
  const [query, setQuery] = useState("");
  const entities = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!metadata) return [];
    if (!needle) return metadata.entities;
    return metadata.entities.filter((entity) =>
      entity.name.toLowerCase().includes(needle)
      || entity.columns.some((column) => column.name.toLowerCase().includes(needle)),
    );
  }, [metadata, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-text-3" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tables and columns" className="pl-9" />
      </div>
      {!metadata ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-3">No schema snapshot is available yet.</p>
      ) : null}
      <div className="space-y-2">
        {entities.map((entity) => (
          <details key={entity.id} className="rounded-lg border border-border bg-surface">
            <summary className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <Database className="h-4 w-4 shrink-0 text-accent-2" />
                <span className="truncate text-sm font-medium">{entity.namespace}.{entity.name}</span>
              </span>
              <span className="shrink-0 text-[11px] text-text-3">
                {entity.estimatedRowCount === null ? "rows unknown" : entity.estimatedRowCount.toLocaleString()}
              </span>
            </summary>
            <div className="border-t border-border px-3 py-2">
              {entity.columns.map((column) => (
                <div key={column.name} className="flex items-center justify-between gap-3 py-1 text-xs">
                  <span className="truncate font-mono">{column.name}</span>
                  <span className="shrink-0 text-text-3">{column.nativeType}{column.primaryKey ? " · PK" : ""}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
