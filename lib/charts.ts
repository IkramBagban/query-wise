import { isDateColumn, isNumericColumn } from "@/lib/utils";
import type { ChartConfig, ChartHint, ChartType, QueryResult } from "@/types";

const MAX_PIE_CATEGORIES = 8;
const MAX_BAR_CATEGORIES = 40;
const HIGH_CARDINALITY_DIMENSION = 60;

type ColumnKind = "date" | "numeric" | "text";

type ColumnProfile = {
  kind: ColumnKind;
  distinctCount: number;
  nonNullCount: number;
  likelyId: boolean;
};

function makeConfig(type: ChartType, overrides: Partial<ChartConfig>): ChartConfig {
  return {
    type,
    availableTypes: ["bar", "line", "pie", "scatter", "area", "table"],
    title: undefined,
    ...overrides,
  };
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 8) return null;
  const ts = Date.parse(trimmed);
  return Number.isNaN(ts) ? null : ts;
}

function isLikelyIdColumn(column: string): boolean {
  const normalized = column.toLowerCase();
  return normalized === "id" || normalized.endsWith("_id") || normalized.endsWith("id");
}

function inferColumnProfile(rows: Record<string, unknown>[], column: string): ColumnProfile {
  let nonNullCount = 0;
  let numericCount = 0;
  let dateCount = 0;
  const distinct = new Set<string>();

  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    nonNullCount += 1;

    if (parseDate(value) !== null) {
      dateCount += 1;
    }
    if (parseNumeric(value) !== null) {
      numericCount += 1;
    }

    if (distinct.size < 200) {
      distinct.add(String(value));
    }
  }

  const firstNonNull = rows.find((row) => row[column] != null)?.[column];
  const firstTypeHint =
    firstNonNull instanceof Date
      ? "timestamp"
      : typeof firstNonNull === "number"
        ? "numeric"
        : typeof firstNonNull === "string"
          ? parseNumeric(firstNonNull) !== null
            ? "numeric"
            : parseDate(firstNonNull) !== null
              ? "timestamp"
              : "text"
          : "text";

  const dateLikeByName = isDateColumn(column, firstTypeHint);
  const numericLikeByName = isNumericColumn(firstTypeHint);

  const dateRatio = nonNullCount > 0 ? dateCount / nonNullCount : 0;
  const numericRatio = nonNullCount > 0 ? numericCount / nonNullCount : 0;

  let kind: ColumnKind = "text";
  if (dateLikeByName || dateRatio >= 0.7) {
    kind = "date";
  } else if (numericLikeByName || numericRatio >= 0.7) {
    kind = "numeric";
  }

  return {
    kind,
    distinctCount: distinct.size,
    nonNullCount,
    likelyId: isLikelyIdColumn(column),
  };
}

function isNumericResultColumn(rows: Record<string, unknown>[], column: string): boolean {
  const profile = inferColumnProfile(rows, column);
  return profile.kind === "numeric";
}

function pickBestDimensionColumn(columns: string[], profiles: Map<string, ColumnProfile>): string | null {
  const preferred = columns.find((column) => profiles.get(column)?.kind === "date");
  if (preferred) return preferred;
  const textDimension = columns.find((column) => profiles.get(column)?.kind === "text");
  if (textDimension) return textDimension;
  return columns[0] ?? null;
}

function withYKeys(config: ChartConfig): ChartConfig {
  if (config.yKey && (!config.yKeys || config.yKeys.length === 0)) {
    return { ...config, yKeys: [config.yKey] };
  }
  return config;
}

export function detectChartConfig(result: QueryResult): ChartConfig {
  const { columns, rows } = result;
  if (rows.length === 0 || columns.length === 0) {
    return makeConfig("table", { availableTypes: ["table", "bar", "line", "area", "scatter", "pie"] });
  }

  if (columns.length === 1 && rows.length === 1) {
    return makeConfig("table", { availableTypes: ["table"] });
  }

  const profiles = new Map(columns.map((column) => [column, inferColumnProfile(rows, column)] as const));
  const dateColumns = columns.filter((column) => profiles.get(column)?.kind === "date");
  const numericColumns = columns.filter((column) => profiles.get(column)?.kind === "numeric");
  const numericMetricColumns = numericColumns.filter((column) => !profiles.get(column)?.likelyId);
  const xCandidate = pickBestDimensionColumn(columns, profiles);

  if (!xCandidate) {
    return makeConfig("table", { availableTypes: ["table"] });
  }

  if (dateColumns.length > 0 && numericMetricColumns.length > 0) {
    const xKey = dateColumns[0];
    const yKeys = numericMetricColumns.slice(0, 3);
    return withYKeys(
      makeConfig("line", {
        xKey,
        yKey: yKeys[0],
        yKeys,
        availableTypes: ["line", "area", "bar", "scatter", "table"],
      }),
    );
  }

  if (numericMetricColumns.length >= 2 && (dateColumns.length === 0 || numericColumns.length === columns.length)) {
    return withYKeys(
      makeConfig("scatter", {
        xKey: numericMetricColumns[0],
        yKey: numericMetricColumns[1],
        yKeys: [numericMetricColumns[1]],
        availableTypes: ["scatter", "line", "bar", "table"],
      }),
    );
  }

  if (numericMetricColumns.length >= 1) {
    const yKeys = numericMetricColumns.slice(0, 3);
    const xProfile = profiles.get(xCandidate);
    const distinct = xProfile?.distinctCount ?? rows.length;

    if (
      yKeys.length === 1 &&
      xProfile?.kind === "text" &&
      distinct > 1 &&
      distinct <= MAX_PIE_CATEGORIES &&
      rows.length <= 20
    ) {
      return makeConfig("pie", {
        nameKey: xCandidate,
        valueKey: yKeys[0],
        availableTypes: ["pie", "bar", "line", "area", "scatter", "table"],
      });
    }

    if (xProfile?.kind === "text" && distinct > HIGH_CARDINALITY_DIMENSION) {
      return withYKeys(
        makeConfig("table", {
          yKey: yKeys[0],
          yKeys,
          availableTypes: ["table", "bar", "line", "area", "scatter"],
        }),
      );
    }

    const preferredType: ChartType = xProfile?.kind === "date" ? "line" : "bar";
    const canShowPie = xProfile?.kind === "text" && distinct <= MAX_PIE_CATEGORIES && yKeys.length === 1;
    const availableTypes: ChartType[] =
      xProfile?.kind === "date"
        ? ["line", "area", "bar", "scatter", "table"]
        : canShowPie
          ? ["bar", "line", "area", "scatter", "pie", "table"]
          : ["bar", "line", "area", "scatter", "table"];

    return withYKeys(
      makeConfig(preferredType, {
        xKey: xCandidate,
        yKey: yKeys[0],
        yKeys,
        availableTypes,
      }),
    );
  }

  const xProfile = profiles.get(xCandidate);
  if (xProfile?.kind === "text" && xProfile.distinctCount <= MAX_BAR_CATEGORIES && columns.length >= 2) {
    return makeConfig("bar", {
      xKey: xCandidate,
      yKey: columns[1],
      yKeys: [columns[1]],
      availableTypes: ["bar", "table"],
    });
  }

  return makeConfig("table", { availableTypes: ["table", "bar", "line", "area", "scatter"] });
}

function applyChartHint(base: ChartConfig, result: QueryResult, hint?: ChartHint | null): ChartConfig {
  if (!hint?.type) return base;

  const { columns, rows } = result;
  const columnSet = new Set(columns);

  const hasColumn = (key?: string): key is string => Boolean(key && columnSet.has(key));
  const numericKeys = (hint.yKeys ?? [])
    .filter((key) => hasColumn(key) && isNumericResultColumn(rows, key));

  if (hint.type === "pie") {
    if (!hasColumn(hint.nameKey) || !hasColumn(hint.valueKey)) return base;
    if (!isNumericResultColumn(rows, hint.valueKey)) return base;
    const nameProfile = inferColumnProfile(rows, hint.nameKey);
    if (nameProfile.distinctCount > MAX_PIE_CATEGORIES) return base;
    return makeConfig("pie", {
      nameKey: hint.nameKey,
      valueKey: hint.valueKey,
      availableTypes: ["pie", "bar", "line", "area", "scatter", "table"],
    });
  }

  if (hint.type === "table") {
    return makeConfig("table", { availableTypes: ["table", "bar", "line", "area", "scatter", "pie"] });
  }

  if (!hasColumn(hint.xKey)) return base;
  const xProfile = inferColumnProfile(rows, hint.xKey);
  if (xProfile.kind === "text" && xProfile.distinctCount > HIGH_CARDINALITY_DIMENSION) {
    return base;
  }
  const chosenYKeys = numericKeys.length > 0 ? numericKeys : undefined;
  const chosenYKey =
    (hasColumn(hint.yKey) && isNumericResultColumn(rows, hint.yKey) && hint.yKey) ||
    chosenYKeys?.[0];

  if (!chosenYKey) return base;

  return makeConfig(hint.type, {
    xKey: hint.xKey,
    yKey: chosenYKey,
    yKeys: chosenYKeys ?? [chosenYKey],
    availableTypes:
      xProfile.kind === "date"
        ? ["line", "area", "bar", "scatter", "table"]
        : ["bar", "line", "area", "scatter", "pie", "table"],
  });
}

export function resolveChartConfig(result: QueryResult, hint?: ChartHint | null): ChartConfig {
  const base = detectChartConfig(result);
  const resolved = applyChartHint(base, result, hint);

  const withFallbackType = resolved.availableTypes.includes(resolved.type)
    ? resolved
    : {
      ...resolved,
      availableTypes: [resolved.type, ...resolved.availableTypes],
    };

  return withYKeys(withFallbackType);
}
