
import { Client } from "pg";
import type { CanonicalDataSourceMetadata, MetadataEntity, MetadataIntrospectionOptions, MetadataRelationship, MetadataSection } from "../../types";
import { canonicalType } from "./json";
import { mapPostgresError } from "../errors";
import { parsePostgresUrl } from "./url";
import { resolvePublicEndpoint } from "./network-policy";
import { pinnedPostgresConfig } from "./client-config";

type EntityRow = { namespace: string; name: string; kind: "table" | "view" | "materialized-view"; estimated_count: string | null };
type ColumnRow = { namespace: string; entity_name: string; name: string; ordinal: number; native_type: string; nullable: boolean; primary_key: boolean; generated: boolean };
type RelationshipRow = { id: string; from_namespace: string; from_entity: string; from_columns: string[]; to_namespace: string; to_entity: string; to_columns: string[] };
const entityId = (namespace: string, name: string) => `${namespace}.${name}`;

export async function introspectPostgresMetadata(connectionString: string, options: MetadataIntrospectionOptions): Promise<CanonicalDataSourceMetadata> {
  const parsed = parsePostgresUrl(connectionString);
  const endpoint = await resolvePublicEndpoint(parsed.host);
  const client = new Client(pinnedPostgresConfig(parsed, endpoint.address));
  const measuredAt = new Date().toISOString();
  try {
    await client.connect();
    await client.query(`SET statement_timeout = ${Math.max(1_000, Math.min(options.timeoutMs, 30_000))}`);
    const namespaceValues = options.includeNamespaces?.length ? options.includeNamespaces : null;
    const entitiesResult = await client.query<EntityRow>(`
      SELECT n.nspname AS namespace, c.relname AS name,
        CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view' ELSE 'materialized-view' END AS kind,
        CASE WHEN c.relkind IN ('r','p','m') THEN GREATEST(c.reltuples, 0)::bigint::text ELSE NULL END AS estimated_count
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND ($1::text[] IS NULL OR n.nspname = ANY($1))
      ORDER BY n.nspname, c.relname LIMIT $2
    `, [namespaceValues, options.maxEntities + 1]);
    const entityRows = entitiesResult.rows.slice(0, options.maxEntities);
    const namespaceNames: string[] = [...new Set(entityRows.map((row) => row.namespace))].slice(0, options.maxNamespaces);
    const scopedEntities = entityRows.filter((row) => namespaceNames.includes(row.namespace));
    const identities = scopedEntities.map((row) => entityId(row.namespace, row.name));

    const columnsResult = await client.query<ColumnRow>(`
      WITH columns AS (
        SELECT n.nspname AS namespace, c.relname AS entity_name, a.attname AS name, a.attnum AS ordinal,
          pg_catalog.format_type(a.atttypid, a.atttypmod) AS native_type, NOT a.attnotnull AS nullable,
          EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS primary_key,
          a.attgenerated <> '' AS generated,
          row_number() OVER (PARTITION BY n.nspname, c.relname ORDER BY a.attnum) AS position
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE a.attnum > 0 AND NOT a.attisdropped
      )
      SELECT namespace, entity_name, name, ordinal, native_type, nullable, primary_key, generated
      FROM columns WHERE namespace || '.' || entity_name = ANY($1::text[]) AND position <= $2
      ORDER BY namespace, entity_name, ordinal
    `, [identities, options.maxColumnsPerEntity + 1]);
    const byEntity = new Map<string, ColumnRow[]>();
    for (const row of columnsResult.rows) byEntity.set(entityId(row.namespace, row.entity_name), [...(byEntity.get(entityId(row.namespace, row.entity_name)) ?? []), row]);
    const columnsTruncated = [...byEntity.values()].some(
      (columns) => columns.length > options.maxColumnsPerEntity,
    );

    const relationshipsResult = await client.query<RelationshipRow>(`
      SELECT con.oid::text AS id, fn.nspname AS from_namespace, fc.relname AS from_entity,
        ARRAY(SELECT fa.attname FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_catalog.pg_attribute fa ON fa.attrelid=con.conrelid AND fa.attnum=k.attnum ORDER BY k.ord) AS from_columns,
        tn.nspname AS to_namespace, tc.relname AS to_entity,
        ARRAY(SELECT ta.attname FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord) JOIN pg_catalog.pg_attribute ta ON ta.attrelid=con.confrelid AND ta.attnum=k.attnum ORDER BY k.ord) AS to_columns
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class fc ON fc.oid=con.conrelid JOIN pg_catalog.pg_namespace fn ON fn.oid=fc.relnamespace
      JOIN pg_catalog.pg_class tc ON tc.oid=con.confrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=tc.relnamespace
      WHERE con.contype='f' AND fn.nspname || '.' || fc.relname = ANY($1::text[]) LIMIT $2
    `, [identities, options.maxRelationships + 1]);

    const entities: MetadataEntity[] = scopedEntities.map((row) => ({
      id: entityId(row.namespace, row.name),
      namespace: row.namespace,
      name: row.name,
      kind: row.kind,
      columns: (byEntity.get(entityId(row.namespace, row.name)) ?? []).slice(0, options.maxColumnsPerEntity).map((column) => ({
        name: column.name, ordinal: column.ordinal, nativeType: column.native_type,
        canonicalType: canonicalType(column.native_type), nullable: column.nullable,
        primaryKey: column.primary_key, generated: column.generated,
      })),
      estimatedRowCount: row.estimated_count == null ? null : Number(row.estimated_count),
      estimatedRowCountMeasuredAt: row.estimated_count == null ? null : measuredAt,
    }));
    const relationships: MetadataRelationship[] = relationshipsResult.rows.slice(0, options.maxRelationships).map((row) => ({
      id: row.id, fromEntityId: entityId(row.from_namespace, row.from_entity), fromColumns: row.from_columns,
      toEntityId: entityId(row.to_namespace, row.to_entity), toColumns: row.to_columns,
    }));
    const truncatedSections: MetadataSection[] = [];
    if (entitiesResult.rows.length > options.maxEntities || namespaceNames.length < new Set(entityRows.map((row) => row.namespace)).size) truncatedSections.push("entities" as const);
    if (relationshipsResult.rows.length > options.maxRelationships) truncatedSections.push("relationships" as const);
    if (columnsTruncated) truncatedSections.push("columns" as const);
    return {
      schemaVersion: 1, snapshotVersion: 0, partition: { index: 0, count: 1 }, providerId: "postgresql", dialectId: "postgresql",
      sourceName: parsed.databaseName, namespaces: namespaceNames.map((name) => ({ name })), entities, relationships,
      completeness: { complete: truncatedSections.length === 0, truncatedSections, omittedCounts: {} }, measuredAt,
    };
  } catch (error) {
    throw mapPostgresError(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}
