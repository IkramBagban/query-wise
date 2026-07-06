"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
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
  skipEntrance?: boolean;
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
  skipEntrance,
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
  const [detailsView, setDetailsView] = useState<"chart" | "table">("chart");
  const { pushToast } = useToast();

  const config: ChartConfig = { ...baseConfig, type: chartType };

  if (!run || !preview || !Array.isArray(preview.rows) || !Array.isArray(preview.columns)) return null;
  const result = previewResult ?? previewToQueryResult(preview);
  const dialogTypeButtons = CHART_TYPES.filter((entry) => dialogChartTypes.includes(entry.value));
  const rowCount = block?.rowCount ?? run.returnedRowCount ?? preview.returnedRowCount;
  const executionTimeMs = block?.executionTimeMs ?? run.executionTimeMs;
  const sqlText = block?.sql ?? run.generatedQuery?.text;
  const showPin = !block || block.index === 0;

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
        skipEntrance={skipEntrance}
        glow={skipEntrance}
        actions={
          <motion.div
            initial={skipEntrance ? { opacity: 0, x: -8 } : false}
            animate={skipEntrance ? { opacity: 1, x: 0 } : false}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex items-center gap-1.5"
          >
            <IconAction label="Open chart details" onClick={() => setDetailsOpen(true)}><Maximize2 className="size-4" /></IconAction>
            <ExportMenu onExport={exportResult} />
            {showPin && <DashboardMenu dashboardOptions={dashboardOptions} onCreateDashboard={onCreateDashboard} onSave={save} button="icon" />}
          </motion.div>
        }
      />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen} panelClassName="max-h-[92vh] max-w-[96vw] overflow-y-auto p-4 sm:max-w-6xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong">Chart details {block ? `(Block ${block.index})` : ""}</p>
            <h2 className="mt-1 font-syne text-2xl font-semibold">{config.title ?? block?.purpose ?? "Query result"}</h2>
            <p className="mt-1 text-xs text-faint">{formatNumber(rowCount)} rows{executionTimeMs != null ? ` · ${executionTimeMs}ms` : ""}</p>
          </div>
          <button type="button" aria-label="Close chart details" onClick={() => setDetailsOpen(false)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text shadow-sm transition hover:bg-surface-2"><X className="size-5" /></button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Chart type">
            {dialogTypeButtons.map(({ label, value, icon: Icon }) => (
              <button key={value} type="button" title={label} aria-label={`${label} chart`} onClick={() => setChartType(value)} className={`inline-flex size-9 items-center justify-center rounded-lg border transition ${chartType === value ? "border-accent bg-accent-soft text-accent-strong" : "border-border text-faint hover:bg-surface-2 hover:text-text"}`}><Icon className="size-4" /></button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button type="button" title="Chart view" aria-label="Show chart" onClick={() => setDetailsView("chart")} className={`inline-flex size-8 items-center justify-center rounded-md transition ${detailsView === "chart" ? "bg-accent-soft text-accent-strong" : "text-faint hover:text-text"}`}><BarChart3 className="size-4" /></button>
              <button type="button" title="Table view" aria-label="Show raw data table" onClick={() => setDetailsView("table")} className={`inline-flex size-8 items-center justify-center rounded-md transition ${detailsView === "table" ? "bg-accent-soft text-accent-strong" : "text-faint hover:text-text"}`}><Table2 className="size-4" /></button>
            </div>
            <ExportMenu onExport={exportResult} />
            {showPin && <DashboardMenu dashboardOptions={dashboardOptions} onCreateDashboard={onCreateDashboard} onSave={save} button="label" />}
          </div>
        </div>

        <div className="mt-5 h-90 rounded-xl border border-border bg-surface-2/40 p-3">
          {detailsView === "chart" ? <V2Chart preview={preview} config={config} /> : <TableView result={result} />}
        </div>
        <details className="mt-5 overflow-hidden rounded-xl border border-border bg-surface-2 shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><Code2 className="size-4 text-accent" />Generated SQL</span>
            <ChevronDown className="size-4 text-faint" />
          </summary>
          <div className="border-t border-border p-3">
            {sqlText ? <CodeBlock sql={sqlText} /> : <p className="text-sm text-muted">No SQL was generated for this response.</p>}
          </div>
        </details>
      </Dialog>
    </>
  );
}
