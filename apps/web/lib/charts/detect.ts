import type { ChartConfig, ChartType, QueryResult } from "@/types";

import {
  HIGH_CARDINALITY_DIMENSION,
  MAX_BAR_CATEGORIES,
  MAX_PIE_CATEGORIES,
} from "./constants";
import { makeConfig, withYKeys } from "./config";
import { inferColumnProfile, pickBestDimensionColumn } from "./profiles";

export function detectChartConfig(result: QueryResult): ChartConfig {
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

  if (
    numericMetricColumns.length >= 2 &&
    (dateColumns.length === 0 || numericColumns.length === columns.length)
  ) {
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
