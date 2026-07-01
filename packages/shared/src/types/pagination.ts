import type { ContractVersion } from "./core";

export interface PageRequest { cursor?: string; limit?: number }
export interface CursorPage<T> {
  contractVersion: ContractVersion;
  items: T[];
  pageInfo: { nextCursor: string | null; hasMore: boolean; limit: number };
}
