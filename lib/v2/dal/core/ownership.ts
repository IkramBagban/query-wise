import "server-only";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { ClerkUserId, ResourceId } from "@/types/v2";

export interface OwnerScopedColumns {
  id: AnyPgColumn;
  ownerUserId: AnyPgColumn;
  deletedAt?: AnyPgColumn;
}

export function ownedResourceWhere(columns: OwnerScopedColumns, ownerUserId: ClerkUserId, id: ResourceId): SQL {
  return and(eq(columns.id, id), eq(columns.ownerUserId, ownerUserId), columns.deletedAt ? isNull(columns.deletedAt) : undefined)!;
}
