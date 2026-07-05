import type { ChartConfig, ChartType, QueryResult } from "@/types";

import {
  HIGH_CARDINALITY_DIMENSION,
  MAX_BAR_CATEGORIES,
  MAX_PIE_CATEGORIES,
} from "./constants";
import { makeConfig, withYKeys } from "./config";
import { inferColumnProfile, pickBestDimensionColumn } from "./profiles";

import { validateAxisSemantics } from "./axis";

function detectChartConfigInternal(result: QueryResult): ChartConfig {
  const { columns, rows } = result;
  if (rows.length === 0 || columns.length === 0) {
    return makeConfig("table", {
      availableTypes: ["table", "bar", "line", "area", "scatter", "pie"],
    });
  }

  if (columns.length === 1 && rows.length === 1) {
    return makeConfig("table", { availableTypes: ["table"] });
  }

  const profiles = new Map(
    columns.map((column) => [column, inferColumnProfile(rows, column)] as const),
  );
  const dateColumns = columns.filter((column) => profiles.get(column)?.kind === "date");
  const numericColumns = columns.filter((column) => profiles.get(column)?.kind === "numeric");
  const numericMetricColumns = numericColumns.filter(
    (column) => !profiles.get(column)?.likelyId,
  );
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

  // A categorical/date column with manageable cardinality is a real dimension —
  // e.g. product_name in "top 5 products by sales". When one exists, a bar/line
  // of dimension→metric is the right chart. Scatter (metric-vs-metric) is only
  // correct when there is NO such dimension (every meaningful column is a
  // measure). Checking this first fixes top-N results rendering as a
  // meaningless qty-vs-sales scatter.
  const xCandidateProfile = profiles.get(xCandidate);
  const hasUsableDimension =
    (xCandidateProfile?.kind === "text" || xCandidateProfile?.kind === "date") &&
    (xCandidateProfile?.distinctCount ?? rows.length) <= HIGH_CARDINALITY_DIMENSION;

  if (numericMetricColumns.length >= 2 && !hasUsableDimension) {
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
    const xProfile = profiles.get(xCandidate);
    const distinct = xProfile?.distinctCount ?? rows.length;
    // Categorical dimension with metrics of wildly different magnitude (e.g.
    // total_qty ~500 alongside total_sales ~800k) would produce an unreadable
    // grouped bar where the small series is invisible. Default to the single
    // dominant metric; the user can still switch/add series. Date dimensions
    // keep multiple series since trends are compared on their own shape.
    const candidateYKeys = numericMetricColumns.slice(0, 3);
    const magnitudes = candidateYKeys.map((key) =>
      Math.max(0, ...rows.map((row) => Math.abs(Number(row[key]) || 0))),
    );
    const maxMag = Math.max(...magnitudes);
    const minMag = Math.min(...magnitudes.filter((value) => value > 0), maxMag);
    const wildlyDifferentScales = xProfile?.kind !== "date" && maxMag > 0 && maxMag / minMag > 100;
    const yKeys = wildlyDifferentScales
      ? [candidateYKeys[magnitudes.indexOf(maxMag)]]
      : candidateYKeys;

    // Bar is the default for a categorical dimension — it reads as a ranking or
    // comparison, which is what these results almost always are. Pie is offered
    // as an option (low cardinality, single measure) but never the default:
    // comparing slice areas is far harder than comparing bar lengths.
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
    const canShowPie =
      xProfile?.kind === "text" &&
      distinct <= MAX_PIE_CATEGORIES &&
      yKeys.length === 1;
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
  if (
    xProfile?.kind === "text" &&
    xProfile.distinctCount <= MAX_BAR_CATEGORIES &&
    columns.length >= 2
  ) {
    return makeConfig("bar", {
      xKey: xCandidate,
      yKey: columns[1],
      yKeys: [columns[1]],
      availableTypes: ["bar", "table"],
    });
  }

  return makeConfig("table", {
    availableTypes: ["table", "bar", "line", "area", "scatter"],
  });
}

export function detectChartConfig(result: QueryResult): ChartConfig {
  const config = detectChartConfigInternal(result);
  
  if (config.type !== "table" && !validateAxisSemantics(config.type, result.rows, config)) {
    return makeConfig("table", {
      availableTypes: config.availableTypes,
    });
  }
  
  return config;
}
