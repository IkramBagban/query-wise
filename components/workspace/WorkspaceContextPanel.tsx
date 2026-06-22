"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Database, Filter, RefreshCw, Search } from "lucide-react";

import { CodeBlock } from "@/components/ui/code-block";
import { TableItem } from "@/components/schema/TableItem";
import type { ChatMessage, DbConnection, SchemaInfo } from "@/types";

type ContextTab = "schema" | "sql" | "summary";

interface WorkspaceContextPanelProps {
  connection: DbConnection | null;
  schema: SchemaInfo | null;
  schemaAnalysis: string | null;
  loadingSchema: boolean;
  messages: ChatMessage[];
  onRefreshSchema: () => void;
}

export function WorkspaceContextPanel({
  connection,
  schema,
  schemaAnalysis,
  loadingSchema,
  messages,
  onRefreshSchema,
}: WorkspaceContextPanelProps) {
  const [activeTab, setActiveTab] = useState<ContextTab>("schema");
  const [query, setQuery] = useState("");
  const latestSql = [...messages].reverse().find((message) => message.sql)?.sql;

  const filteredTables = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!schema) return [];
    if (!needle) return schema.tables;
    return schema.tables.filter(
      (table) =>
        table.name.toLowerCase().includes(needle) ||
        table.columns.some((column) => column.name.toLowerCase().includes(needle)),
    );
  }, [query, schema]);

  return (
    <aside className="hidden h-full w-[330px] shrink-0 flex-col border-l border-[#dfe7e2] bg-white xl:flex">
      <div className="flex h-[72px] items-center justify-center border-b border-[#e5ebe7] px-4">
        <div className="grid w-full grid-cols-3">
          {([
            ["schema", "Schema"],
            ["sql", "SQL Preview"],
            ["summary", "DB Summary"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative h-[72px] text-[13px] font-semibold transition ${
                activeTab === id ? "text-[#087c3f]" : "text-[#42564c] hover:text-[#17291f]"
              }`}
            >
              {label}
              {activeTab === id ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#0a9349]" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "schema" ? (
        <>
          <div className="flex items-center gap-2 px-4 py-5">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#77887f]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tables..."
                className="h-10 w-full rounded-lg border border-[#dce5df] bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#8fc6a8]"
              />
            </label>
            <button className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#dce5df] text-[#52665c] hover:bg-[#f4f8f5]">
              <Filter className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-[#52665c]">
              Tables ({filteredTables.length})
            </p>
            <div className="flex flex-col gap-1">
              {loadingSchema ? (
                <p className="py-4 text-xs text-[#718178]">Loading schema...</p>
              ) : filteredTables.length > 0 ? (
                filteredTables.map((table) => <TableItem key={table.name} table={table} />)
              ) : (
                <p className="py-4 text-xs leading-relaxed text-[#718178]">
                  {connection ? "No matching tables found." : "Connect a database to explore its schema."}
                </p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {activeTab === "sql" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {latestSql ? (
            <CodeBlock sql={latestSql} />
          ) : (
            <p className="rounded-xl border border-dashed border-[#d8e3dc] p-5 text-sm leading-relaxed text-[#718178]">
              Generated SQL for your latest analysis will appear here.
            </p>
          )}
        </div>
      ) : null}

      {activeTab === "summary" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-[#17291f]">Database Summary</h3>
          <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-[#607369]">
            {schemaAnalysis ?? schema?.summary ?? "Connect a database to generate its summary."}
          </p>
        </div>
      ) : null}

      <div className="m-4 mt-auto rounded-xl border border-[#dce5df] bg-white p-4 shadow-[0_5px_16px_rgba(25,58,40,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#263c32]">
            <Database className="size-4 text-[#087c3f]" />
            Database
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#078943]">
            <CheckCircle2 className="size-3.5" />
            {connection ? "Connected" : "Offline"}
          </span>
        </div>
        <dl className="mt-4 flex flex-col gap-3 text-xs text-[#667970]">
          <div className="flex justify-between gap-3">
            <dt>Type:</dt>
            <dd className="font-medium text-[#263c32]">{connection ? "PostgreSQL" : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Tables:</dt>
            <dd className="font-medium text-[#263c32]">{schema?.tables.length ?? "—"}</dd>
          </div>
        </dl>
        <button
          onClick={onRefreshSchema}
          disabled={!connection || loadingSchema}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#d9e3dd] text-xs font-semibold text-[#344b3f] transition hover:bg-[#f4f8f5] disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loadingSchema ? "animate-spin" : ""}`} />
          Refresh Schema
        </button>
      </div>
    </aside>
  );
}
