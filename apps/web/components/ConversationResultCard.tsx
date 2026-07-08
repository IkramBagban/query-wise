"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaChart,
  BarChart3,
  Bookmark,
  Check,
  Code2,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  LineChart,
  Maximize2,
  PieChart,
  Plus,
  ScatterChart,
  Table2,
  X,
} from "lucide-react";

import { TableView } from "@/components/charts/TableView";
import { ResultBlockCard } from "@/components/ResultBlockCard";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { isBoundedResultPreview, previewToQueryResult, V2Chart } from "@/components/V2Chart";
import { computeResultViewOptions } from "@/lib/charts/options";
import { useToast } from "@/hooks/useToast";
import { exportToCSV, exportToJSON, exportToXLSX, generateFilename } from "@/lib/export";
import { formatNumber } from "@/lib/utils";
import type { ConversationMessageDto } from "@/lib/api-client";
import type { ChartConfig, ChartType, QueryResultBlock } from "@query-wise/shared/types";

/** First predominantly-numeric column (preferring the configured measure). */
function summarizeNumericColumn(
  columns: string[],
  rows: Record<string, unknown>[],
  preferred: Array<string | undefined>,
) {
  const candidates = [...(preferred.filter(Boolean) as string[]), ...columns.slice(1), ...columns.slice(0, 1)];
  const seen = new Set<string>();
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);
    const values: number[] = [];
    for (const row of rows) {
      const raw = row[key];
      const parsed = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (Number.isFinite(parsed)) values.push(parsed);
    }
    if (values.length > 0 && values.length >= rows.length * 0.6) {
      const sum = values.reduce((a, b) => a + b, 0);
      return { key, sum, avg: sum / values.length, min: Math.min(...values), max: Math.max(...values) };
    }
  }
  return null;
}

const compactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const CHART_TYPES: { label: string; value: ChartType; icon: typeof BarChart3 }[] = [
  { label: "Bar", value: "bar", icon: BarChart3 },
  { label: "Line", value: "line", icon: LineChart },
  { label: "Area", value: "area", icon: AreaChart },
  { label: "Pie", value: "pie", icon: PieChart },
  { label: "Scatter", value: "scatter", icon: ScatterChart },
];

interface ConversationResultCardProps {
  message: ConversationMessageDto;
  block?: QueryResultBlock;
  dashboardOptions: { value: string; label: string }[];
  onCreateDashboard: (name: string) => Promise<string>;
  onSave: (message: ConversationMessageDto, config: ChartConfig, dashboardId: string) => Promise<void>;
}

function IconAction({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

function ExportMenu({ onExport }: { onExport: (format: "csv" | "xlsx" | "json") => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const choose = (format: "csv" | "xlsx" | "json") => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div ref={rootRef} className="relative">
      <IconAction label="Download data" onClick={() => setOpen((value) => !value)}><Download className="size-4" /></IconAction>
      {open ? (
        <div className="absolute right-0 top-9 z-50 w-44 rounded-lg border border-border bg-surface p-1 shadow-xl">
          <button type="button" onClick={() => choose("csv")} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-surface-2"><FileSpreadsheet className="size-4" />Export CSV</button>
          <button type="button" onClick={() => choose("xlsx")} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-surface-2"><FileSpreadsheet className="size-4" />Export Excel</button>
          <button type="button" onClick={() => choose("json")} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-surface-2"><FileJson className="size-4" />Export JSON</button>
        </div>
      ) : null}
    </div>
  );
}

function DashboardMenu({
  dashboardOptions,
  onCreateDashboard,
  onSave,
  button,
}: {
  dashboardOptions: { value: string; label: string }[];
  onCreateDashboard: (name: string) => Promise<string>;
  onSave: (dashboardId: string) => Promise<void>;
  button: "icon" | "label";
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  async function save(dashboardId: string) {
    setBusyId(dashboardId);
    setError(null);
    try {
      await onSave(dashboardId);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save chart");
    } finally {
      setBusyId(null);
    }
  }

  async function createAndSave() {
    if (!newName.trim()) return;
    setBusyId("new");
    setError(null);
    try {
      const dashboardId = await onCreateDashboard(newName.trim());
      await onSave(dashboardId);
      setNewName("");
      setCreating(false);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create dashboard");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {button === "icon" ? (
        <IconAction label="Save to dashboard" onClick={() => setOpen((value) => !value)}><Bookmark className="size-4" /></IconAction>
      ) : (
        <Button size="sm" onClick={() => setOpen((value) => !value)}><Bookmark />Save to Dashboard</Button>
      )}
      {open ? (
        <div className="absolute right-0 top-9 z-50 w-64 rounded-xl border border-border bg-surface p-2 shadow-xl">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Choose dashboard</p>
          <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
            {dashboardOptions.map((dashboard) => (
              <button key={dashboard.value} type="button" disabled={busyId !== null} onClick={() => void save(dashboard.value)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-xs font-medium hover:bg-surface-2 disabled:opacity-60">
                <span className="truncate">{dashboard.label}</span>
                {busyId === dashboard.value ? <Spinner size="sm" label={`Saving to ${dashboard.label}`} /> : null}
              </button>
            ))}
            {!dashboardOptions.length ? <p className="px-2 py-3 text-xs text-faint">No dashboards yet.</p> : null}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            {creating ? (
              <div className="flex flex-col gap-2">
                <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createAndSave(); }} placeholder="Dashboard name" className="h-9 rounded-md border border-border bg-surface px-3 text-xs outline-none focus:border-accent" />
                <div className="flex justify-end gap-2">
                  <button type="button" className="px-2 py-1 text-xs text-faint hover:text-text" onClick={() => setCreating(false)}>Cancel</button>
                  <button type="button" disabled={!newName.trim() || busyId !== null} className="px-2 py-1 text-xs font-semibold text-accent-strong disabled:opacity-50" onClick={() => void createAndSave()}>{busyId === "new" ? "Creating..." : "Create and save"}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-accent-strong hover:bg-accent-soft" onClick={() => setCreating(true)}><Plus className="size-3.5" />Create new dashboard</button>
            )}
            {error ? <p className="mt-2 px-2 text-xs text-danger">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ConversationResultCard({
  message,
  block,
  dashboardOptions,
  onCreateDashboard,
  onSave,
}: ConversationResultCardProps) {
  const run = message.queryRun;
  const preview = block ? block.resultPreview : run?.resultPreview;
  const baseConfig = (block?.chartConfig ?? message.metadata.chartConfig ?? { schemaVersion: 1, type: "table" }) as ChartConfig;
  const previewResult = isBoundedResultPreview(preview) ? previewToQueryResult(preview) : null;
  // Same data-aware option logic the inline card uses, so the fullscreen dialog
  // offers only valid chart types instead of all five.
  const viewOptions = previewResult ? computeResultViewOptions(previewResult) : null;
  const dialogChartTypes = viewOptions?.chartTypes ?? ["bar"];
  const initialType: ChartType =
    baseConfig.type !== "table" && dialogChartTypes.includes(baseConfig.type)
      ? baseConfig.type
      : viewOptions?.defaultChartType ?? dialogChartTypes[0] ?? "bar";
  const [chartType, setChartType] = useState<ChartType>(initialType);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsView, setDetailsView] = useState<"chart" | "table" | "sql">("chart");
  const [sqlCopied, setSqlCopied] = useState(false);
  const { pushToast } = useToast();

  const config: ChartConfig = { ...baseConfig, type: chartType };

  if (!run || !preview || !Array.isArray(preview.rows) || !Array.isArray(preview.columns)) return null;
  const result = previewResult ?? previewToQueryResult(preview);
  const dialogTypeButtons = CHART_TYPES.filter((entry) => dialogChartTypes.includes(entry.value));
  const rowCount = block?.rowCount ?? run.returnedRowCount ?? preview.returnedRowCount;
  const executionTimeMs = block?.executionTimeMs ?? run.executionTimeMs;
  const sqlText = block?.sql ?? run.generatedQuery?.text;
  const showPin = !block || block.index === 0;
  const stats = summarizeNumericColumn(result.columns, result.rows, [
    (baseConfig as { valueKey?: string }).valueKey,
    (baseConfig as { yKey?: string }).yKey,
  ]);
  const truncated = Boolean(preview.truncated);

  function copySql() {
    if (!sqlText) return;
    void navigator.clipboard.writeText(sqlText).then(() => {
      setSqlCopied(true);
      window.setTimeout(() => setSqlCopied(false), 1600);
    });
  }

  function exportResult(format: "csv" | "xlsx" | "json") {
    const filename = generateFilename(config.title ?? "query-result", format);
    try {
      if (format === "csv") exportToCSV(result, filename);
      if (format === "json") exportToJSON(result, filename);
      if (format === "xlsx") {
        void exportToXLSX(result, filename)
          .then(() => pushToast({ title: "Excel workbook downloaded", variant: "success" }))
          .catch(() => pushToast({ title: "Excel export failed", variant: "error" }));
        return;
      }
      pushToast({ title: `${format.toUpperCase()} downloaded`, variant: "success" });
    } catch {
      pushToast({ title: "Export failed", variant: "error" });
    }
  }

  const save = async (dashboardId: string) => {
    await onSave(message, config, dashboardId);
    pushToast({ title: "Chart saved to dashboard", variant: "success" });
  };

  return (
    <>
      <ResultBlockCard
        title={config.title ?? block?.purpose}
        preview={preview}
        sql={sqlText}
        rowCount={rowCount}
        executionTimeMs={executionTimeMs}
        chartConfig={baseConfig}
        onChartTypeChange={setChartType}
        actions={
          <>
            <IconAction label="Open chart details" onClick={() => setDetailsOpen(true)}><Maximize2 className="size-4" /></IconAction>
            <ExportMenu onExport={exportResult} />
            {showPin && <DashboardMenu dashboardOptions={dashboardOptions} onCreateDashboard={onCreateDashboard} onSave={save} button="icon" />}
          </>
        }
      />

      <Dialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        panelClassName="h-[92vh] w-full max-w-[96vw] overflow-hidden rounded-2xl p-0 sm:max-w-[1200px] sm:p-0"
      >
        <div className="flex h-full flex-col">
          {/* inspector header */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface-2/70 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent-strong">
                Result inspector{block ? ` · block ${block.index}` : ""}
              </p>
              <h2 className="mt-0.5 truncate font-syne text-lg font-semibold sm:text-xl">
                {config.title ?? block?.purpose ?? "Query result"}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] text-faint">
                {formatNumber(rowCount)} rows
              </span>
              {executionTimeMs != null ? (
                <span className="hidden whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] text-faint sm:block">
                  {executionTimeMs} ms
                </span>
              ) : null}
              <span className="hidden whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 font-mono text-[10.5px] text-accent-strong md:block">
                ✓ read-only
              </span>
              <button
                type="button"
                aria-label="Close inspector"
                onClick={() => setDetailsOpen(false)}
                className="ml-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted transition hover:bg-surface-2 hover:text-text"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* canvas + control rail */}
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* canvas */}
            <div className="relative flex min-h-[340px] flex-1 flex-col overflow-hidden p-4 sm:p-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
              />
              <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface p-4 shadow-sm">
                {detailsView === "sql" && sqlText ? (
                  <button
                    type="button"
                    onClick={copySql}
                    className={`absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] transition-all duration-150 ${
                      sqlCopied
                        ? "border-accent-line bg-accent-soft text-accent-strong"
                        : "border-border bg-surface text-muted hover:border-accent-line hover:text-text"
                    }`}
                  >
                    {sqlCopied ? <Check className="size-3" strokeWidth={2.5} /> : <Copy className="size-3" />}
                    {sqlCopied ? "copied" : "copy"}
                  </button>
                ) : null}
                {detailsView === "chart" ? (
                  <V2Chart preview={preview} config={config} />
                ) : detailsView === "table" ? (
                  <TableView result={result} />
                ) : sqlText ? (
                  <CodeBlock sql={sqlText} />
                ) : (
                  <p className="text-sm text-muted">No SQL was generated for this response.</p>
                )}
              </div>

              {/* quick stats over the measure column */}
              {detailsView !== "sql" && stats ? (
                <div className="relative mt-3 flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                    {stats.key.replaceAll("_", " ")}
                  </span>
                  {([
                    ["Σ", stats.sum],
                    ["avg", stats.avg],
                    ["min", stats.min],
                    ["max", stats.max],
                  ] as const).map(([label, value]) => (
                    <span
                      key={label}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] text-muted"
                    >
                      <span className="text-faint">{label}</span>
                      <span className="tabular-nums text-text">{compactNumber(value)}</span>
                    </span>
                  ))}
                  {truncated ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 font-mono text-[10.5px] text-warning">
                      preview truncated
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* control rail */}
            <aside className="flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-t border-border bg-surface-2/50 p-5 lg:w-[280px] lg:border-l lg:border-t-0">
              <section>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">View</p>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Result view">
                  {([
                    { id: "chart" as const, icon: BarChart3, label: "Chart" },
                    { id: "table" as const, icon: Table2, label: "Table" },
                    { id: "sql" as const, icon: Code2, label: "SQL" },
                  ]).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={detailsView === id}
                      onClick={() => setDetailsView(id)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-all duration-150 ${
                        detailsView === id ? "bg-accent text-accent-ink shadow-sm" : "text-muted hover:text-text"
                      }`}
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {detailsView === "chart" ? (
                <section>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Chart type</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5" aria-label="Chart type">
                    {dialogTypeButtons.map(({ label, value, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={chartType === value}
                        onClick={() => setChartType(value)}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-all duration-150 ${
                          chartType === value
                            ? "border-accent-line bg-accent-soft text-accent-strong"
                            : "border-border bg-surface text-muted hover:border-border-2 hover:text-text"
                        }`}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Export</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {([
                    { format: "csv" as const, icon: FileSpreadsheet, label: "CSV" },
                    { format: "xlsx" as const, icon: FileSpreadsheet, label: "Excel workbook" },
                    { format: "json" as const, icon: FileJson, label: "JSON" },
                  ]).map(({ format, icon: Icon, label }) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => exportResult(format)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-all duration-150 hover:border-accent-line hover:text-text"
                    >
                      <Icon className="size-3.5 shrink-0 text-accent-strong" />
                      {label}
                      <Download className="ml-auto size-3 text-faint" />
                    </button>
                  ))}
                </div>
              </section>

              {showPin ? (
                <section>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Dashboard</p>
                  <div className="mt-2">
                    <DashboardMenu dashboardOptions={dashboardOptions} onCreateDashboard={onCreateDashboard} onSave={save} button="label" />
                  </div>
                </section>
              ) : null}

              <p className="mt-auto font-mono text-[10px] leading-relaxed text-faint">
                Generated SQL is validated read-only before a single row is touched.
              </p>
            </aside>
          </div>
        </div>
      </Dialog>
    </>
  );
}
