
import { parse, toSql } from "pgsql-ast-parser";
import type { ProviderQuery, QuerySafetyPolicy, QueryValidationResult } from "../../types";

const DENIED_FUNCTIONS = new Set([
  "dblink", "dblink_connect", "dblink_connect_u", "dblink_disconnect", "dblink_exec",
  "lo_export", "lo_import", "pg_advisory_lock", "pg_advisory_lock_shared",
  "pg_cancel_backend", "pg_file_rename", "pg_file_unlink", "pg_file_write",
  "pg_logdir_ls", "pg_ls_dir", "pg_read_binary_file", "pg_read_file", "pg_sleep",
  "pg_stat_file", "pg_terminate_backend", "set_config",
]);

/** Statement shapes pgsql-ast-parser produces for read-only queries. */
const READ_ONLY_STATEMENT_TYPES = new Set(["select", "union", "union all", "values"]);

/**
 * A statement is read-only when it is a SELECT/UNION/VALUES, or a WITH (CTE)
 * whose body — and every CTE definition — is itself read-only. `WITH ... SELECT`
 * parses as type "with", not "select"; treating it as a write was a false
 * positive that blocked legitimate CTE analytics queries.
 */
function isReadOnlyStatement(statement: Record<string, unknown> | undefined): boolean {
  if (!statement) return false;
  const type = typeof statement.type === "string" ? statement.type : "";
  if (READ_ONLY_STATEMENT_TYPES.has(type)) return true;
  if (type !== "with") return false;
  const body = statement.in as Record<string, unknown> | undefined;
  if (!isReadOnlyStatement(body)) return false;
  const ctes = Array.isArray(statement.bind) ? statement.bind : [];
  return ctes.every((cte) => {
    const cteStatement = (cte as { statement?: Record<string, unknown> } | null)?.statement;
    return isReadOnlyStatement(cteStatement);
  });
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) return void value.forEach((item) => walk(item, visit));
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  visit(node);
  Object.values(node).forEach((nested) => walk(nested, visit));
}

export function validatePostgresQuery(query: ProviderQuery, policy: QuerySafetyPolicy): QueryValidationResult {
  const violations: QueryValidationResult["violations"] = [];
  if (query.dialectId !== "postgresql") violations.push({ code: "DIALECT_MISMATCH", message: "The query dialect does not match the adapter." });
  if (policy.blockComments && /--|\/\*/.test(query.text)) violations.push({ code: "COMMENTS_BLOCKED", message: "SQL comments are not allowed." });
  if (Buffer.byteLength(query.text, "utf8") > 100 * 1024) violations.push({ code: "QUERY_TOO_LARGE", message: "The query is too large." });

  let statements: ReturnType<typeof parse> = [];
  try {
    statements = parse(query.text);
  } catch {
    violations.push({ code: "PARSE_FAILED", message: "The SQL query could not be parsed." });
  }
  if (statements.length !== 1) violations.push({ code: "SINGLE_STATEMENT_REQUIRED", message: "Exactly one SQL statement is required." });
  const statement = statements[0] as unknown as Record<string, unknown> | undefined;
  if (!isReadOnlyStatement(statement)) violations.push({ code: "READ_ONLY_REQUIRED", message: "Only read-only SELECT queries are allowed." });

  if (statement) {
    walk(statement, (node) => {
      if (node.type === "call") {
        const functionName = typeof node.function === "object" && node.function && "name" in node.function
          ? String((node.function as { name: unknown }).name).toLowerCase()
          : "";
        if (DENIED_FUNCTIONS.has(functionName)) violations.push({ code: "UNSAFE_FUNCTION", message: "The query calls a blocked function." });
      }
      if (policy.blockSystemCatalogs && typeof node.name === "string" &&
        (/^pg_/i.test(node.name) || node.name.toLowerCase() === "information_schema")) {
        violations.push({ code: "SYSTEM_CATALOG_BLOCKED", message: "System catalog access is not allowed." });
      }
      if ("into" in node || "for" in node && node.for) {
        violations.push({ code: "UNSAFE_SELECT_CLAUSE", message: "SELECT INTO and locking clauses are not allowed." });
      }
    });
  }

  return {
    valid: violations.length === 0,
    normalizedQuery: violations.length || !statement ? null : { ...query, text: toSql.statement(statement as never) },
    violations,
  };
}
