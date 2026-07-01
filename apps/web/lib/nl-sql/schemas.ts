import { z } from "zod";

export const RewriteQuestionSchema = z.object({
  requiresDatabase: z.boolean(),
  standaloneQuestion: z.string().trim().min(1).max(900),
  // directAnswer: z.string().trim().max(1200).nullable().default(null),
  directAnswer: z.string().trim().max(1200).nullable(),
});

export const SelectedTableSchema = z.object({
  tableName: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(240),
});

export const TableSelectionSchema = z.object({
  selectedTables: z.array(SelectedTableSchema).min(1).max(8),
});

export const PrunedColumnSchema = z.object({
  name: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(180),
});

export const PrunedTableSchema = z.object({
  tableName: z.string().trim().min(1),
  columns: z.array(PrunedColumnSchema).min(1).max(24),
});

export const ColumnPruningSchema = z.object({
  tables: z.array(PrunedTableSchema).min(1).max(8),
  joinPaths: z.array(z.string().trim().min(1).max(300)).max(16).default([]),
});

export const SqlPlanSchema = z.object({
  sql: z.string().trim().min(1).max(12000),
  resultIntent: z.string().trim().min(1).max(500),
  chartHint: z
    .union([
      z.object({
        type: z.enum(["bar", "line", "pie", "scatter", "area", "table"]),
        xKey: z.string().trim().min(1).default(""),
        yKey: z.string().trim().min(1).default(""),
        yKeys: z.array(z.string().trim().min(1)).default([]),
        nameKey: z.string().trim().min(1).default(""),
        valueKey: z.string().trim().min(1).default(""),
      }),
      z.null(),
    ])
    .default(null),
});

export const ChartHintOnlySchema = z.object({
  chartHint: SqlPlanSchema.shape.chartHint,
});

export type RewriteQuestion = z.infer<typeof RewriteQuestionSchema>;
export type TableSelection = z.infer<typeof TableSelectionSchema>;
export type ColumnPruning = z.infer<typeof ColumnPruningSchema>;
export type SqlPlan = z.infer<typeof SqlPlanSchema>;
export type ChartHintOnly = z.infer<typeof ChartHintOnlySchema>;
