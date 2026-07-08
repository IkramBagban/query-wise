import "server-only";

import { getAppDb } from "@query-wise/shared/app-db";
import type {
  CanonicalDataSourceMetadata,
  DashboardDateRange,
  WidgetFilterBinding,
} from "@query-wise/shared/types";
import { resolveRange } from "./date-range";

// SPEC-06 §5: a single, honest date-range binding for a SQL-generated stack.
//
// Rather than a full semantic layer, we detect the query's primary time predicate
// at pin time and rewrite ITS literal bounds to the fixed parameter markers
// :qw_from / :qw_to. At refresh time we substitute the markers with the selected
// range. The markers are a closed vocabulary we insert ourselves and the values
// we bind are generated ISO timestamps — never user free-text — so the rewritten
// SQL still goes through the read-only validate→execute runtime unchanged.

export const MARKER_FROM = ":qw_from";
export const MARKER_TO = ":qw_to";

const HAS_MARKERS = /:qw_(from|to)\b/;

/** A quoted-string or typed date/timestamp literal on the RHS of a comparison. */
const DATE_LITERAL = `(?:(?:date|timestamp|timestamptz)\\s+)?'[^']*'`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Best-effort pin-time analysis. Detects an explicit lower (and optional upper)
 * bound on one of the connection's known date columns and rewrites those literals
 * to markers. Returns null when nothing can be confidently bound — the widget is
 * then simply not filter-bound and the global picker skips it (spec-endorsed).
 */
export function analyzeFilterBinding(
  sqlText: string,
  dateColumns: string[],
): { sqlText: string; binding: WidgetFilterBinding } | null {
  if (HAS_MARKERS.test(sqlText)) {
    // Already parameterized (e.g. re-pin) — trust the existing markers.
    for (const column of dateColumns) {
      const ref = `(?:(\\w+)\\.)?${escapeRegExp(column)}`;
      const m = new RegExp(`${ref}\\s*(?:>=|>)\\s*:qw_from`, "i").exec(sqlText);
      if (m) {
        return {
          sqlText,
          binding: { dateColumn: column, tableAlias: m[1] ?? null, defaultRange: { preset: "90d" } },
        };
      }
    }
    return null;
  }

  for (const column of dateColumns) {
    const ref = `(?:(\\w+)\\.)?${escapeRegExp(column)}`;
    // Lower bound: <alias?>.col >= <date literal>
    const lower = new RegExp(`${ref}\\s*(>=|>)\\s*(${DATE_LITERAL})`, "i");
    const lowerMatch = lower.exec(sqlText);
    if (!lowerMatch) continue;
    const tableAlias = lowerMatch[1] ?? null;

    let rewritten = sqlText.replace(lower, (full, _a, op, lit) =>
      full.slice(0, full.length - String(lit).length) + MARKER_FROM,
    );

    // Upper bound (optional): <same ref> < / <= <date literal>
    const upper = new RegExp(`${ref}\\s*(<=|<)\\s*(${DATE_LITERAL})`, "i");
    if (upper.test(rewritten)) {
      rewritten = rewritten.replace(upper, (full, _a, op, lit) =>
        full.slice(0, full.length - String(lit).length) + MARKER_TO,
      );
    }

    return {
      sqlText: rewritten,
      binding: { dateColumn: column, tableAlias, defaultRange: { preset: "90d" } },
    };
  }
  return null;
}

export function hasFilterMarkers(sqlText: string): boolean {
  return HAS_MARKERS.test(sqlText);
}

const DATE_TYPE = /date|time/i;

/**
 * SPEC-03 profiling already classifies column types. Read the latest schema
 * snapshot for the connection and return the set of date/timestamp column names —
 * the candidate columns the pin-time analyzer will try to bind. Best-effort: if
 * no snapshot is available yet, returns an empty list (widget stays unbound).
 */
export async function getConnectionDateColumns(
  connectionId: string,
  ownerUserId: string,
): Promise<string[]> {
  const snapshot = await getAppDb()
    .schemaSnapshot.findFirst({
      where: { connectionId, ownerUserId, status: { in: ["succeeded", "syncing"] } },
      orderBy: { snapshotVersion: "desc" },
      select: { metadata: true },
    })
    .catch(() => null);
  const metadata = snapshot?.metadata as unknown as CanonicalDataSourceMetadata | null;
  if (!metadata?.entities) return [];
  const names = new Set<string>();
  for (const entity of metadata.entities) {
    for (const column of entity.columns ?? []) {
      if (DATE_TYPE.test(column.nativeType ?? "")) names.add(column.name);
    }
  }
  return [...names];
}

function sqlTimestampLiteral(date: Date): string {
  // ISO-8601 in UTC; single-quote-safe because Date#toISOString never emits quotes.
  return `TIMESTAMPTZ '${date.toISOString()}'`;
}

/**
 * Substitute the range into a marker-bearing SQL string. If the SQL has no
 * markers this is a no-op. Only the upper marker present without a lower is
 * still handled. `range` falls back to the binding's default when absent.
 */
export function applyRangeMarkers(
  sqlText: string,
  binding: WidgetFilterBinding | null,
  range: DashboardDateRange | null,
): string {
  if (!HAS_MARKERS.test(sqlText)) return sqlText;
  const effective = range ?? binding?.defaultRange ?? { preset: "90d" };
  const resolved = resolveRange(effective);
  return sqlText
    .replaceAll(MARKER_FROM, sqlTimestampLiteral(resolved.from))
    .replaceAll(MARKER_TO, sqlTimestampLiteral(resolved.to));
}
