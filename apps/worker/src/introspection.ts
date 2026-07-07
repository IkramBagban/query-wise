/**
 * Small shared helpers for the SPEC-03 profiling and join-inference stages, which both run trusted
 * worker-authored SQL through the adapter's `executeIntrospectionQuery` path.
 */

/** Quotes a Postgres identifier, escaping embedded double quotes. */
export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Quotes a schema-qualified relation name (`"schema"."table"`). */
export function quoteQualified(namespace: string, name: string): string {
  return `${quoteIdent(namespace)}.${quoteIdent(name)}`;
}

/** Stable composite key for locating an entity by its schema-qualified name. */
export function entityKey(namespace: string, name: string): string {
  return `${namespace}.${name}`;
}
