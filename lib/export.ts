import type { QueryResult } from "@/types";

/**
 * Convert query results to CSV format
 */
export function exportToCSV(result: QueryResult, filename = "query-results.csv"): void {
  const { columns, rows } = result;

  // Create CSV header
  const header = columns.map((col) => escapeCSVValue(col)).join(",");

  // Create CSV rows
  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const value = row[col];
        return escapeCSVValue(formatValue(value));
      })
      .join(",")
  );

  // Combine header and rows
  const csv = [header, ...csvRows].join("\n");

  // Download file
  downloadFile(csv, filename, "text/csv;charset=utf-8;");
}

/**
 * Convert query results to JSON format
 */
export function exportToJSON(result: QueryResult, filename = "query-results.json"): void {
  const { rows } = result;

  // Pretty print JSON
  const json = JSON.stringify(rows, null, 2);

  // Download file
  downloadFile(json, filename, "application/json;charset=utf-8;");
}

/**
 * Copy query results to clipboard as tab-separated values (Excel-friendly)
 */
export async function copyToClipboard(result: QueryResult): Promise<void> {
  const { columns, rows } = result;

  // Create TSV (tab-separated values) for better Excel compatibility
  const header = columns.join("\t");
  const tsvRows = rows.map((row) =>
    columns.map((col) => formatValue(row[col])).join("\t")
  );

  const tsv = [header, ...tsvRows].join("\n");

  // Copy to clipboard
  await navigator.clipboard.writeText(tsv);
}

/**
 * Escape CSV value (handle quotes, commas, newlines)
 */
function escapeCSVValue(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format value for export (handle null, dates, objects)
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Download file helper
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate filename from query or timestamp
 */
export function generateFilename(query?: string, extension = "csv"): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  
  if (query && query.length > 0) {
    // Extract first few words from query for filename
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join("-");
    
    if (words) {
      return `${words}-${timestamp}.${extension}`;
    }
  }

  return `query-results-${timestamp}.${extension}`;
}
