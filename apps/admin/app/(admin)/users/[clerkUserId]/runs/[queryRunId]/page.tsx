import Link from "next/link";
import { notFound } from "next/navigation";
import { DebugGate } from "@/components/debug-gate";
import { Card, DataTable, EmptyState, Mono } from "@/components/ui";
import { formatCompact, formatUtcDate } from "@/lib/format";
import { getRunDebug } from "@/lib/queries/run-debug";

export default async function RunDebugPage({
  params,
}: {
  params: Promise<{ clerkUserId: string; queryRunId: string }>;
}) {
  const { clerkUserId, queryRunId } = await params;
  const data = await getRunDebug(clerkUserId, queryRunId);
  if (!data) notFound();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/50 pb-6">
        <Link
          href={`/users/${encodeURIComponent(clerkUserId)}`}
          className="text-xs text-muted-foreground hover:text-primary mb-2"
        >
          ← User detail
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Run debug
        </h1>
        <p className="text-sm text-muted-foreground">{queryRunId}</p>
      </div>

      <DebugGate queryRunId={queryRunId} targetUserId={clerkUserId}>
        <div className="space-y-4">
          <div className="animate-slide-up" style={{ animationDelay: "50ms", animationFillMode: "both" }}>
            <Card title="Question (user content)">
              <pre className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm text-foreground">
                {data.questionText ?? "—"}
              </pre>
            </Card>
          </div>

          <div className="animate-slide-up" style={{ animationDelay: "150ms", animationFillMode: "both" }}>
            <Card title="Generated SQL (user content)">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs text-foreground">
                {data.generatedQuery == null
                  ? "—"
                  : typeof data.generatedQuery === "string"
                    ? data.generatedQuery
                    : JSON.stringify(data.generatedQuery, null, 2)}
              </pre>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 animate-slide-up" style={{ animationDelay: "250ms", animationFillMode: "both" }}>
            <Card title="Status timeline">
              <ul className="space-y-1 text-sm">
                <li>Status: <strong>{data.status}</strong> (v{data.statusVersion})</li>
                <li>Created: {formatUtcDate(data.timeline.createdAt)}</li>
                <li>Generated: {formatUtcDate(data.timeline.generatedAt)}</li>
                <li>Started: {formatUtcDate(data.timeline.startedAt)}</li>
                <li>Finished: {formatUtcDate(data.timeline.finishedAt)}</li>
                <li>
                  Error:{" "}
                  <span className="text-danger">
                    {data.errorCode ?? "—"}{" "}
                    {data.errorMessage ? `· ${data.errorMessage}` : ""}
                  </span>
                </li>
                <li>
                  Connection: {data.connectionName ?? data.connectionId}{" "}
                  <Mono>{data.connectionId}</Mono>
                </li>
              </ul>
            </Card>

            <Card title="Result data (always redacted)">
              <p className="text-sm text-amber-200/90">
                {data.resultSummary.label}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                returnedRowCount={String(data.resultSummary.returnedRowCount)} ·
                totalRowCount={String(data.resultSummary.totalRowCount)} ·
                truncated={String(data.resultSummary.truncated)} · blocks=
                {data.resultSummary.blockCount}
              </p>
            </Card>
          </div>

          <div className="animate-slide-up" style={{ animationDelay: "350ms", animationFillMode: "both" }}>
            <Card title="Validation result">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs">
                {data.validationResult == null
                  ? "—"
                  : JSON.stringify(data.validationResult, null, 2)}
              </pre>
            </Card>
          </div>

          <div className="animate-slide-up" style={{ animationDelay: "450ms", animationFillMode: "both" }}>
            <Card title="Agent / usage metadata">
              {data.usage ? (
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Steps</dt>
                    <dd>{data.usage.agentSteps ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">SQL attempts</dt>
                    <dd>{data.usage.sqlAttempts ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Budget</dt>
                    <dd>{data.usage.budgetProfile ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Chart</dt>
                    <dd>
                      {data.usage.chartGenerated
                        ? data.usage.chartType ?? "yes"
                        : "no"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tokens in/out/cached</dt>
                    <dd>
                      {formatCompact(data.usage.inputTokens)} /{" "}
                      {formatCompact(data.usage.outputTokens)} /{" "}
                      {formatCompact(data.usage.cachedInputTokens)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Primary model</dt>
                    <dd className="font-mono text-xs">
                      {data.usage.primaryProvider}/{data.usage.primaryModel}
                    </dd>
                  </div>
                </dl>
              ) : (
                <EmptyState>No QueryRunUsage row.</EmptyState>
              )}
            </Card>
          </div>

          <div className="animate-slide-up" style={{ animationDelay: "550ms", animationFillMode: "both" }}>
            <Card title="Per-call LLM usage">
              {data.llmCalls.length === 0 ? (
                <EmptyState>No LlmUsageRecord rows.</EmptyState>
              ) : (
                <DataTable
                  headers={[
                    "Task",
                    "Provider",
                    "Model",
                    "In",
                    "Out",
                    "Cached",
                    "Latency",
                    "Attempt",
                    "OK",
                    "When",
                  ]}
                >
                  {data.llmCalls.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-1.5">{c.task}</td>
                      <td className="px-3 py-1.5">{c.provider}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{c.model}</td>
                      <td className="px-3 py-1.5 tabular-nums">{c.inputTokens}</td>
                      <td className="px-3 py-1.5 tabular-nums">{c.outputTokens}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {c.cachedInputTokens}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {c.latencyMs ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {c.attemptIndex ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">{c.success ? "yes" : "no"}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {formatUtcDate(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Card>
          </div>
        </div>
      </DebugGate>
    </div>
  );
}
