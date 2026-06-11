import { z } from "zod";

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const ResourceIdSchema = z.string().uuid();
export const DashboardNameSchema = z.string().trim().min(1).max(120);
export const WidgetTitleSchema = z.string().trim().min(1).max(120);

export const ChartConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.enum(["bar", "line", "pie", "scatter", "area", "table"]),
    xKey: z.string().max(200).optional(),
    yKey: z.string().max(200).optional(),
    yKeys: z.array(z.string().max(200)).max(50).optional(),
    nameKey: z.string().max(200).optional(),
    valueKey: z.string().max(200).optional(),
    title: z.string().max(120).optional(),
  })
  .strict();

export const WidgetLayoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    x: z.number().int().min(0).max(1000),
    y: z.number().int().min(0).max(100000),
    w: z.number().int().min(1).max(1000),
    h: z.number().int().min(1).max(1000),
  })
  .strict();

const ResultColumnSchema = z
  .object({
    name: z.string().min(1).max(200),
    canonicalType: z
      .enum([
        "boolean",
        "integer",
        "decimal",
        "string",
        "date",
        "time",
        "datetime",
        "json",
        "binary",
        "uuid",
        "unknown",
      ])
      .optional(),
  })
  .passthrough();

export const BoundedSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    columns: z.array(ResultColumnSchema).max(50),
    rows: z.array(z.record(z.string(), JsonValueSchema)).max(100),
    previewRowCount: z.number().int().min(0).max(100),
    returnedRowCount: z.number().int().min(0).max(500),
    totalRowCount: z.number().int().min(0).nullable(),
    truncated: z.boolean(),
    bytes: z.number().int().min(0).max(262_144),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.previewRowCount !== value.rows.length ||
      value.previewRowCount > value.returnedRowCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Snapshot row counts are inconsistent.",
      });
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 262_144) {
      context.addIssue({
        code: "custom",
        message: "Snapshot exceeds the 256 KiB limit.",
      });
    }
  });

export const ProviderQuerySchema = z
  .object({
    kind: z.literal("sql"),
    dialect: z.literal("postgresql"),
    text: z.string().min(1).max(102_400),
  })
  .strict();

export const WidgetCreateSchema = z
  .object({
    title: WidgetTitleSchema,
    chartConfig: ChartConfigSchema,
    layout: WidgetLayoutSchema,
    snapshot: BoundedSnapshotSchema,
    queryRunId: ResourceIdSchema.nullish(),
    queryDefinition: ProviderQuerySchema.nullish(),
  })
  .strict();

export const WidgetUpdateSchema = WidgetCreateSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No widget changes supplied.");

export const WidgetLayoutBatchSchema = z
  .object({
    widgets: z
      .array(
        z
          .object({
            id: ResourceIdSchema,
            layout: WidgetLayoutSchema,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.widgets.map((widget) => widget.id)).size !== value.widgets.length) {
      context.addIssue({ code: "custom", message: "Widget IDs must be unique." });
    }
  });

