/**
 * Supported database connection modes.
 */
export type DbType = "demo" | "custom";

/**
 * Active database connection metadata.
 */
export interface DbConnection {
  type: DbType;
  connectionString?: string; // only for custom
  name: string;
}

/**
 * Column metadata extracted from schema introspection.
 */
export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; column: string };
}

/**
 * Table-level schema details and optional data samples.
 */
export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  rowCount?: number;
  sampleData?: Record<string, unknown>[];
}

/**
 * Full database schema context used by backend and LLM prompts.
 */
export interface SchemaInfo {
  tables: SchemaTable[];
  relationships: Relationship[];
  summary: string; // Human-readable schema summary generated during introspection
}

/**
 * Foreign-key relationship between two tables.
 */
export interface Relationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

/**
 * Chat participant role.
 */
export type MessageRole = "user" | "assistant";

/**
 * Conversation message with optional SQL/result metadata.
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string; // natural language
  sql?: string; // generated SQL
  result?: QueryResult;
  chartConfig?: ChartConfig;
  error?: string;
  timestamp: number;
}

/**
 * Normalized SQL execution output.
 */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

/**
 * Supported visualization types.
 */
export type ChartType = "bar" | "line" | "pie" | "scatter" | "area" | "table";

/**
 * Chart rendering config attached to query results.
 */
export interface ChartConfig {
  type: ChartType;
  xKey?: string;
  yKey?: string;
  nameKey?: string;
  valueKey?: string;
  title?: string;
  availableTypes: ChartType[];
}

/**
 * Single dashboard widget created from a query result.
 */
export interface DashboardWidget {
  id: string;
  title: string;
  sql: string;
  result: QueryResult;
  chartConfig: ChartConfig;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Dashboard containing one or more saved widgets.
 */
export interface Dashboard {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  shareId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Request shape for testing or creating DB connections.
 */
export interface ConnectRequest {
  type: DbType;
  connectionString?: string;
}

/**
 * Response shape for database connection attempts.
 */
export interface ConnectResponse {
  success: boolean;
  name: string;
  error?: string;
}

/**
 * API response for schema introspection.
 */
export interface SchemaResponse {
  schema: SchemaInfo;
}

/**
 * Request payload for natural-language query execution.
 */
export interface QueryRequest {
  question: string;
  history: ChatMessage[];
  connectionString?: string; // undefined = demo db
  provider: "google" | "anthropic";
  model: string;
  apiKey: string;
}

/**
 * Query API response payload.
 */
export interface QueryResponse {
  sql: string;
  result: QueryResult;
  chartConfig: ChartConfig;
  explanation: string;
}

/**
 * Request payload for saving dashboards.
 */
export interface DashboardSaveRequest {
  dashboard: Dashboard;
}

/**
 * Response payload for share-link creation.
 */
export interface ShareResponse {
  shareId: string;
  url: string;
}

/**
 * Common API error payload.
 */
export interface ApiError {
  error: string;
  details?: string;
}
