
import type { DataSourceCapability, DataSourceProviderId, SqlDataSourceAdapter } from "../types";
import { AppError } from "../dal/core";
import { postgresqlAdapter } from "./postgresql/adapter";

const adapters = new Map<DataSourceProviderId, SqlDataSourceAdapter>([
  [postgresqlAdapter.providerId, postgresqlAdapter],
]);

export function getDataSourceAdapter(providerId: string): SqlDataSourceAdapter {
  const adapter = adapters.get(providerId as DataSourceProviderId);
  if (!adapter) {
    throw new AppError("VALIDATION_FAILED", "The requested data source provider is not supported.");
  }
  return adapter;
}

export function requireCapability(adapter: SqlDataSourceAdapter, capability: DataSourceCapability): void {
  if (!adapter.capabilities.has(capability)) {
    throw new AppError("DATA_SOURCE_CAPABILITY_UNSUPPORTED", "The data source does not support this operation.");
  }
}
