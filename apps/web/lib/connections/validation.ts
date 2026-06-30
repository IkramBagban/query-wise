import { z } from "zod";

export const resourceIdSchema = z.string().uuid();
export const idempotencySchema = z.object({ idempotencyKey: z.string().trim().min(8).max(200) }).strict();
export const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  providerId: z.literal("postgresql").default("postgresql"),
  connectionString: z.string().trim().min(1).max(4096),
}).strict();
export const updateConnectionSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  connectionString: z.string().trim().min(1).max(4096).optional(),
}).strict().refine((value) => value.name !== undefined || value.connectionString !== undefined, "At least one field is required.");
export const listConnectionsQuerySchema = z.object({
  cursor: z.string().max(4096).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
