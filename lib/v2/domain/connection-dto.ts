import "server-only";
import type { ConnectionDto, DataSourceCapability, DataSourceConnectionRecord } from "@/types/v2";
import { CONTRACT_VERSION } from "@/types/v2";

export function toConnectionDto(record: DataSourceConnectionRecord, capabilities: readonly DataSourceCapability[]): ConnectionDto {
  if (record.deletedAt || record.status === "deleted") throw new Error("Deleted connections cannot be mapped to a public DTO.");
  return {
    contractVersion: CONTRACT_VERSION, id: record.id, providerId: record.providerId, dialectId: record.dialectId, name: record.name,
    hostDisplay: record.hostDisplay, port: record.port, databaseName: record.databaseName, status: record.status,
    lastTestedAt: record.lastTestedAt, lastSchemaSyncAt: record.lastSchemaSyncAt, schemaSyncStatus: record.schemaSyncStatus,
    capabilities: [...capabilities],
  };
}
