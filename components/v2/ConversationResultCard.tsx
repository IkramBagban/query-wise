"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  BarChart3,
  Bookmark,
  ChevronDown,
  Code2,
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { previewToQueryResult, V2Chart } from "@/components/v2/V2Chart";
import { useToast } from "@/hooks/useToast";
import { exportToCSV, exportToJSON, exportToXLSX, generateFilename } from "@/lib/export";
import { formatNumber } from "@/lib/utils";
import type { ConversationMessageDto } from "@/lib/v2/api-client";
import type { ChartConfig, ChartType } from "@/types/v2";

const CHART_TYPES: { label: string; value: ChartType; icon: typeof BarChart3 }[] = [
  { label: "Bar", value: "bar", icon: BarChart3 },
  { label: "Line", value: "line", icon: LineChart },
  { label: "Area", value: "area", icon: AreaChart },
  { label: "Pie", value: "pie", icon: PieChart },
  { label: "Scatter", value: "scatter", icon: ScatterChart },
];

interface ConversationResultCardProps {
  message: ConversationMessageDto;
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
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-text-2 transition hover:border-border-2 hover:bg-surface-2 hover:text-text-1"
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
        <div className="absolute right-0 top-11 z-50 w-44 rounded-lg border border-border bg-surface p-1 shadow-xl">
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
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-surface p-2 shadow-xl">
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">Choose dashboard</p>
          <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
            {dashboardOptions.map((dashboard) => (
              <button key={dashboard.value} type="button" disabled={busyId !== null} onClick={() => void save(dashboard.value)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-xs font-medium hover:bg-surface-2 disabled:opacity-60">
                <span className="truncate">{dashboard.label}</span>
                {busyId === dashboard.value ? <span className="size-3 animate-spin rounded-full border-2 border-border-2 border-t-accent" /> : null}
              </button>
            ))}
            {!dashboardOptions.length ? <p className="px-2 py-3 text-xs text-text-3">No dashboards yet.</p> : null}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            {creating ? (
              <div className="flex flex-col gap-2">
                <input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createAndSave(); }} placeholder="Dashboard name" className="h-9 rounded-md border border-border bg-surface px-3 text-xs outline-none focus:border-accent" />
                <div className="flex justify-end gap-2">
                  <button type="button" className="px-2 py-1 text-xs text-text-3 hover:text-text-1" onClick={() => setCreating(false)}>Cancel</button>
                  <button type="button" disabled={!newName.trim() || busyId !== null} className="px-2 py-1 text-xs font-semibold text-accent-2 disabled:opacity-50" onClick={() => void createAndSave()}>{busyId === "new" ? "Creating..." : "Create and save"}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold text-accent-2 hover:bg-accent-dim" onClick={() => setCreating(true)}><Plus className="size-3.5" />Create new dashboard</button>
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
  dashboardOptions,
  onCreateDashboard,
  onSave,
}: ConversationResultCardProps) {
  const run = message.queryRun;
  const preview = run?.resultPreview;
  const baseConfig = (message.metadata.chartConfig ?? { schemaVersion: 1, type: "table" }) as ChartConfig;
  const [tab, setTab] = useState<"chart" | "sql">("chart");
  const [chartType, setChartType] = useState<ChartType>(baseConfig.type === "table" ? "bar" : baseConfig.type);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsView, setDetailsView] = useState<"chart" | "table">("chart");
  const { pushToast } = useToast();

  const config = useMemo(() => ({ ...baseConfig, type: chartType }), [baseConfig, chartType]);

  if (!run || !preview || !Array.isArray(preview.rows) || !Array.isArray(preview.columns)) return null;
  const result = previewToQueryResult(preview);
  const rowCount = run.returnedRowCount ?? preview.returnedRowCount;

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
      <Card className="mt-3 overflow-visible rounded-xl border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 pt-3">
          <button type="button" onClick={() => setTab("chart")} className={`flex items-center gap-1.5 border-b-2 px-2 pb-2 text-xs font-medium transition ${tab === "chart" ? "border-accent text-accent-2" : "border-transparent text-text-3 hover:text-text-1"}`}><BarChart3 className="size-3.5" />Chart</button>
          <button type="button" onClick={() => setTab("sql")} className={`flex items-center gap-1.5 border-b-2 px-2 pb-2 text-xs font-medium transition ${tab === "sql" ? "border-accent text-accent-2" : "border-transparent text-text-3 hover:text-text-1"}`}><Code2 className="size-3.5" />SQL</button>
          <span className="ml-auto pb-2 text-[11px] text-text-3">{formatNumber(rowCount)} row{rowCount === 1 ? "" : "s"}{run.executionTimeMs != null ? ` · ${run.executionTimeMs}ms` : ""}</span>
        </div>

        <div className="p-3 sm:p-4">
          {tab === "chart" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Select className="min-w-28" value={chartType} onChange={(value) => setChartType(value as ChartType)} options={CHART_TYPES} />
                <div className="flex items-center gap-1.5">
                  <IconAction label="Open chart details" onClick={() => setDetailsOpen(true)}><Maximize2 className="size-4" /></IconAction>
                  <ExportMenu onExport={exportResult} />
                  <DashboardMenu dashboardOptions={dashboardOptions} onCreateDashboard={onCreateDashboard} onSave={save} button="icon" />
                </div>
              </div>
              <div className="min-w-0 h-[21rem] rounded-lg border border-border bg-surface-2/40 p-2"><V2Chart preview={preview} config={config} /></div>
            </>
          ) : run.generatedQuery ? <CodeBlock sql={run.generatedQuery.text} variant="dark" /> : <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-3">No SQL was generated for this response.</p>}
        </div>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen} panelClassName="max-h-[92vh] max-w-[96vw] overflow-y-auto p-4 sm:max-w-6xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-2">Chart details</p>
            <h2 className="mt-1 font-syne text-2xl font-semibold">{config.title ?? "Query result"}</h2>
            <p className="mt-1 text-xs text-text-3">{formatNumber(rowCount)} rows{run.executionTimeMs != null ? ` · ${run.executionTimeMs}ms` : ""}</p>
          </div>
          <button type="button" aria-label="Close chart details" onClick={() => setDetailsOpen(false)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-1 shadow-sm transition hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Chart type">
            {CHART_TYPES.map(({ label, value, icon: Icon }) => (
              <button key={value} type="button" title={label} aria-label={`${label} chart`} onClick={() => setChartType(value)} className={`inline-flex size-9 items-center justify-center rounded-lg border transition ${chartType === value ? "border-accent bg-accent-dim text-accent-2" : "border-border text-text-3 hover:bg-surface-2 hover:text-text-1"}`}><Icon className="size-4" /></button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button type="button" title="Chart view" aria-label="Show chart" onClick={() => setDetailsView("chart")} className={`inline-flex size-8 items-center justify-center rounded-md transition ${detailsView === "chart" ? "bg-accent-dim text-accent-2" : "text-text-3 hover:text-text-1"}`}><BarChart3 className="size-4" /></button>
              <button type="button" title="Table view" aria-label="Show raw data table" onClick={() => setDetailsView("table")} className={`inline-flex size-8 items-center justify-center rounded-md transition ${detailsView === "table" ? "bg-accent-dim text-accent-2" : "text-text-3 hover:text-text-1"}`}><Table2 className="size-4" /></button>
            </div>
            <ExportMenu onExport={exportResult} />
            <DashboardMenu dashboardOptions={dashboardOptions} onCreateDashboard={onCreateDashboard} onSave={save} button="label" />
          </div>
        </div>

        <div className="mt-5 h-90 rounded-xl border border-border bg-surface-2/40 p-3">
          {detailsView === "chart" ? <V2Chart preview={preview} config={config} /> : <TableView result={result} />}
        </div>
        <details className="mt-5 overflow-hidden rounded-xl border border-border bg-[#102117] text-white shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><Code2 className="size-4 text-accent" />Generated SQL</span>
            <ChevronDown className="size-4 text-text-3" />
          </summary>
          <div className="border-t border-white/10 p-3">
            {run.generatedQuery ? <CodeBlock sql={run.generatedQuery.text} variant="dark" /> : <p className="text-sm text-white/60">No SQL was generated for this response.</p>}
          </div>
        </details>
      </Dialog>
    </>
  );
}

