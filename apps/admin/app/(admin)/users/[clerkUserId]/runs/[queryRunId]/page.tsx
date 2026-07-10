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
    <div className="space-y-6">
      <div>
        <Link
          href={`/users/${encodeURIComponent(clerkUserId)}`}
          className="text-xs text-muted hover:text-accent"
        >
          ← User detail
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Run debug
        </h1>
        <p className="mt-1 font-mono text-xs text-faint">{queryRunId}</p>
      </div>

      <DebugGate queryRunId={queryRunId} targetUserId={clerkUserId}>
        <div className="space-y-4">
          <Card title="Question (user content)">
            <pre className="whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm text-text">
              {data.questionText ?? "—"}
            </pre>
          </Card>

          <Card title="Generated SQL (user content)">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 font-mono text-xs text-text">
              {data.generatedQuery == null
                ? "—"
                : typeof data.generatedQuery === "string"
                  ? data.generatedQuery
                  : JSON.stringify(data.generatedQuery, null, 2)}
            </pre>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
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
              <p className="mt-2 text-xs text-muted">
                returnedRowCount={String(data.resultSummary.returnedRowCount)} ·
                totalRowCount={String(data.resultSummary.totalRowCount)} ·
                truncated={String(data.resultSummary.truncated)} · blocks=
                {data.resultSummary.blockCount}
              </p>
            </Card>
          </div>

          <Card title="Validation result">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 font-mono text-xs">
              {data.validationResult == null
                ? "—"
                : JSON.stringify(data.validationResult, null, 2)}
            </pre>
          </Card>

          <Card title="Agent / usage metadata">
            {data.usage ? (
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-faint">Steps</dt>
                  <dd>{data.usage.agentSteps ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-faint">SQL attempts</dt>
                  <dd>{data.usage.sqlAttempts ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-faint">Budget</dt>
                  <dd>{data.usage.budgetProfile ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-faint">Chart</dt>
                  <dd>
                    {data.usage.chartGenerated
                      ? data.usage.chartType ?? "yes"
                      : "no"}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Tokens in/out/cached</dt>
                  <dd>
                    {formatCompact(data.usage.inputTokens)} /{" "}
                    {formatCompact(data.usage.outputTokens)} /{" "}
                    {formatCompact(data.usage.cachedInputTokens)}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Primary model</dt>
                  <dd className="font-mono text-xs">
                    {data.usage.primaryProvider}/{data.usage.primaryModel}
                  </dd>
                </div>
              </dl>
            ) : (
              <EmptyState>No QueryRunUsage row.</EmptyState>
            )}
          </Card>

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
                    <td className="px-3 py-1.5 text-xs text-muted">
                      {formatUtcDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>
      </DebugGate>
    </div>
  );
}
