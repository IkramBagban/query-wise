/**
 * SPEC-03 §5 — Join-graph inference for FK-less databases (e.g. warehouses with no declared
 * constraints). For every `*_id` column not already covered by a declared foreign key we look for a
 * plausible target entity by name + type, then validate with a bounded value-overlap probe. Edges at
 * or above the confidence threshold are persisted as relationships marked `inferred: true`.
 *
 * The stage is best-effort: it runs within a global time budget, each probe is timeout-bounded, and
 * every failure is swallowed so it never fails the ingestion job.
 */

import { createHash } from "node:crypto";
import { devLog, devLogError } from "@query-wise/shared/observability";
import type { MetadataColumn, MetadataEntity, MetadataRelationship } from "@query-wise/shared/types";
import { getDataSourceAdapter } from "@query-wise/shared/data-sources";
import { getConnectionSecretForIngestion } from "@query-wise/shared/connections";
import { quoteIdent, quoteQualified } from "./introspection";
import { candidateTargetNames, resolveTargetPk, singularize, typesCompatible } from "./ingestion-utils";

const CONFIDENCE_THRESHOLD = 0.8;
const SOURCE_SAMPLE_LIMIT = 100;
const PROBE_TIMEOUT_MS = 2_000;
const GLOBAL_BUDGET_CAP_MS = 60_000;
const PER_CANDIDATE_BUDGET_MS = 2_000;

export interface JoinInferenceResult {
  added: MetadataRelationship[];
  candidatesConsidered: number;
  candidatesValidated: number;
}

function inferredRelationshipId(fromEntityId: string, fromColumn: string, toEntityId: string, toColumn: string): string {
  return `inferred:${createHash("sha256").update(`${fromEntityId}.${fromColumn}->${toEntityId}.${toColumn}`).digest("hex").slice(0, 24)}`;
}

/**
 * Infers join relationships and returns the new inferred edges (does not mutate `relationships`).
 * `relationships` should be the declared relationships used to exclude already-covered columns.
 */
export async function inferJoinRelationships(
  connectionId: string,
  entities: MetadataEntity[],
  relationships: MetadataRelationship[],
): Promise<JoinInferenceResult> {
  const result: JoinInferenceResult = { added: [], candidatesConsidered: 0, candidatesValidated: 0 };

  try {
    const { record, secret } = await getConnectionSecretForIngestion(connectionId);
    if (!record) return result;
    const adapter = getDataSourceAdapter(record.providerId);
    if (!adapter.executeIntrospectionQuery) return result;
    const runQuery = adapter.executeIntrospectionQuery.bind(adapter);

    // Columns already covered by a declared FK — never re-infer these.
    const covered = new Set<string>();
    for (const relationship of relationships) {
      for (const column of relationship.fromColumns) covered.add(`${relationship.fromEntityId}::${column}`);
    }

    // Index target entities by every name form they could be referenced under.
    const targetsByName = new Map<string, MetadataEntity>();
    for (const entity of entities) {
      const lower = entity.name.toLowerCase();
      targetsByName.set(lower, entity);
      targetsByName.set(singularize(lower), entity);
    }

    const globalDeadline = Date.now() + GLOBAL_BUDGET_CAP_MS;

    for (const entity of entities) {
      for (const column of entity.columns) {
        const match = /^(.+)_id$/.exec(column.name.toLowerCase());
        if (!match) continue;
        if (covered.has(`${entity.id}::${column.name}`)) continue;
        if (Date.now() >= globalDeadline) break;

        const prefix = match[1];
        const candidateNames = candidateTargetNames(prefix);
        let target: MetadataEntity | undefined;
        for (const name of candidateNames) {
          const found = targetsByName.get(name);
          if (found && found.id !== entity.id) {
            target = found;
            break;
          }
        }
        if (!target) continue;

        const targetPk = resolveTargetPk(target);
        if (!targetPk) continue;
        if (!typesCompatible(column.canonicalType, targetPk.canonicalType)) continue;

        result.candidatesConsidered += 1;
        const candidateDeadline = Date.now() + PER_CANDIDATE_BUDGET_MS;
        try {
          const confidence = await validateOverlap({
            runQuery,
            record,
            secret,
            source: entity,
            sourceColumn: column,
            target,
            targetPk,
          });
          if (confidence == null) continue;
          result.candidatesValidated += 1;
          if (confidence >= CONFIDENCE_THRESHOLD) {
            result.added.push({
              id: inferredRelationshipId(entity.id, column.name, target.id, targetPk.name),
              fromEntityId: entity.id,
              fromColumns: [column.name],
              toEntityId: target.id,
              toColumns: [targetPk.name],
              inferred: true,
              confidence: Math.round(confidence * 100) / 100,
            });
          }
        } catch (error) {
          devLogError("schema-ingestion.join-inference.probe-failed", "Join overlap probe failed; skipping candidate.", error, {
            connectionId,
            fromEntityId: entity.id,
            fromColumn: column.name,
            toEntityId: target.id,
          });
        }
        // Guard against a slow probe eating the whole budget silently.
        if (Date.now() >= candidateDeadline && Date.now() >= globalDeadline) break;
      }
      if (Date.now() >= globalDeadline) break;
    }

    devLog("info", "schema-ingestion.join-inference.coverage", "Schema ingestion join inference coverage.", {
      connectionId,
      candidatesConsidered: result.candidatesConsidered,
      candidatesValidated: result.candidatesValidated,
      edgesInferred: result.added.length,
    });
    return result;
  } catch (error) {
    devLogError("schema-ingestion.join-inference.failed", "Join inference stage failed.", error, { connectionId });
    return result;
  }
}

async function validateOverlap(input: {
  runQuery: NonNullable<ReturnType<typeof getDataSourceAdapter>["executeIntrospectionQuery"]>;
  record: { id: string; credentialVersion: number };
  secret: { connectionString: string };
  source: MetadataEntity;
  sourceColumn: MetadataColumn;
  target: MetadataEntity;
  targetPk: MetadataColumn;
}): Promise<number | null> {
  const { runQuery, record, secret, source, sourceColumn, target, targetPk } = input;

  // 1. Sample up to N distinct non-null source values.
  const sampleSql =
    `SELECT DISTINCT ${quoteIdent(sourceColumn.name)} AS v FROM ${quoteQualified(source.namespace, source.name)} ` +
    `WHERE ${quoteIdent(sourceColumn.name)} IS NOT NULL LIMIT ${SOURCE_SAMPLE_LIMIT}`;
  const sample = await runQuery(record.id, record.credentialVersion, secret, { text: sampleSql }, { timeoutMs: PROBE_TIMEOUT_MS });
  const values = sample.rows.map((row) => row.v).filter((value) => value != null);
  if (values.length === 0) return null;

  // 2. Count how many of those distinct values exist as target primary keys.
  const containmentSql =
    `SELECT COUNT(*) AS matched FROM (SELECT DISTINCT ${quoteIdent(targetPk.name)} AS k ` +
    `FROM ${quoteQualified(target.namespace, target.name)} WHERE ${quoteIdent(targetPk.name)} = ANY($1)) t`;
  const containment = await runQuery(
    record.id,
    record.credentialVersion,
    secret,
    { text: containmentSql, values: [values] },
    { timeoutMs: PROBE_TIMEOUT_MS },
  );
  const matched = Number(containment.rows[0]?.matched ?? 0);
  if (!Number.isFinite(matched)) return null;
  return matched / values.length;
}
