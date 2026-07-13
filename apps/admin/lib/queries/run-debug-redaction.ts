/**
 * Pure redaction helpers for the content-gated run debug view (SPEC-08 §5.4).
 * No server-only imports — unit-testable in isolation.
 */

export interface ResultSummary {
  /** Always redacted — never the actual rows. */
  redacted: true;
  returnedRowCount: number | null;
  totalRowCount: number | null;
  truncated: boolean | null;
  blockCount: number;
  label: string;
}

/**
 * Pure redaction helper — unit-tested. Accepts partial run-shaped objects.
 */
export function redactResultData(input: {
  returnedRowCount?: number | null;
  totalRowCount?: number | bigint | null;
  truncated?: boolean | null;
  resultPreview?: unknown;
  resultBlocks?: unknown;
}): ResultSummary {
  const blocks = Array.isArray(input.resultBlocks)
    ? input.resultBlocks.length
    : 0;
  const total =
    input.totalRowCount == null
      ? null
      : typeof input.totalRowCount === "bigint"
        ? Number(input.totalRowCount)
        : input.totalRowCount;
  const rows = input.returnedRowCount ?? total ?? 0;
  return {
    redacted: true,
    returnedRowCount: input.returnedRowCount ?? null,
    totalRowCount: total,
    truncated: input.truncated ?? null,
    blockCount: blocks,
    label: `«result data hidden — ${rows} rows, ${blocks} blocks»`,
  };
}

/**
 * Strip any accidental result fields from a DTO before render/response.
 * Used by tests to assert redaction invariants.
 */
export function assertNoResultPayload(data: {
  resultSummary: { redacted: boolean };
}): void {
  const json = JSON.stringify(data);
  if (json.includes("resultPreview") || json.includes("resultBlocks")) {
    throw new Error(
      "Run debug DTO must not contain resultPreview/resultBlocks keys",
    );
  }
  if (!data.resultSummary.redacted) {
    throw new Error("resultSummary.redacted must be true");
  }
}
