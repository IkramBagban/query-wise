/**
 * SPEC-03 §1 — Table importance scoring.
 *
 * Produces a 0-1 importance score per entity that drives the ordering of every downstream
 * enrichment stage (profile, sample, describe, embed). Scoring combines four normalized signals:
 * FK centrality, size, name heuristics, and a table/view kind preference. The score is persisted
 * onto each entity (`importanceScore`) so the web tier can reuse it for Tier-B tie-breaking.
 */

import type { MetadataEntity, MetadataRelationship } from "@query-wise/shared/types";

/** Signal weights. Starting points per the spec; kept as named constants for tuning. */
export const IMPORTANCE_WEIGHTS = {
  fkCentrality: 0.4,
  size: 0.3,
  name: 0.2,
  kind: 0.1,
} as const;

/** Below this row count a name like `sessions` reads as an ops/framework table, not a fact table. */
const TINY_TABLE_ROW_THRESHOLD = 1_000;

/** Fact-like names get a name-signal boost. */
const FACT_NAME_PATTERNS: RegExp[] = [
  /^orders?$/, /order_items?$/, /^transactions?$/, /^events?$/, /^payments?$/,
  /^sales$/, /^invoices?$/, /^sessions?$/, /_fact$/, /^fact_/,
];

/** Framework/ops/audit names get a name-signal penalty. */
const OPS_NAME_PATTERNS: RegExp[] = [
  /^migrations?$/, /_prisma/, /^schema_migrations$/, /^audit_/, /_audit$/,
  /_log$/, /_logs$/, /^jobs?$/,
];

export interface ImportanceContext {
  /** Max number of relationships touching any single entity (for FK-centrality normalization). */
  maxRelationshipTouches: number;
  /** Max log10(rowCount + 1) across the snapshot (for size normalization). */
  maxLogSize: number;
  /** Precomputed per-entity relationship-touch counts, keyed by entity id. */
  touchesByEntityId: Map<string, number>;
}

function log10Size(entity: MetadataEntity): number {
  const rows = entity.estimatedRowCount ?? 0;
  return Math.log10(Math.max(0, rows) + 1);
}

/** Builds the snapshot-level normalization context in one pass. */
export function buildImportanceContext(
  entities: MetadataEntity[],
  relationships: MetadataRelationship[],
): ImportanceContext {
  const touchesByEntityId = new Map<string, number>();
  for (const entity of entities) touchesByEntityId.set(entity.id, 0);
  for (const relationship of relationships) {
    for (const entityId of [relationship.fromEntityId, relationship.toEntityId]) {
      if (touchesByEntityId.has(entityId)) {
        touchesByEntityId.set(entityId, (touchesByEntityId.get(entityId) ?? 0) + 1);
      }
    }
  }
  let maxRelationshipTouches = 0;
  for (const count of touchesByEntityId.values()) {
    if (count > maxRelationshipTouches) maxRelationshipTouches = count;
  }
  let maxLogSize = 0;
  for (const entity of entities) {
    const size = log10Size(entity);
    if (size > maxLogSize) maxLogSize = size;
  }
  return { maxRelationshipTouches, maxLogSize, touchesByEntityId };
}

/** Name-heuristic signal in [0,1]: 0.5 baseline, boosted for fact-like, penalized for ops. */
export function nameSignal(entity: MetadataEntity): number {
  const name = entity.name.toLowerCase();
  const rows = entity.estimatedRowCount ?? 0;
  // `sessions` looks fact-like but is an ops table when tiny (e.g. auth session store): suppress the
  // fact boost and apply the ops penalty so it lands below neutral.
  const isTinySessions = /^sessions?$/.test(name) && rows > 0 && rows < TINY_TABLE_ROW_THRESHOLD;
  let score = 0.5;
  if (!isTinySessions && FACT_NAME_PATTERNS.some((pattern) => pattern.test(name))) score += 0.5;
  if (OPS_NAME_PATTERNS.some((pattern) => pattern.test(name))) score -= 0.5;
  if (isTinySessions) score -= 0.5;
  return Math.max(0, Math.min(1, score));
}

/** Kind preference in [0,1]: tables > views > materialized views for enrichment priority. */
export function kindSignal(entity: MetadataEntity): number {
  switch (entity.kind) {
    case "table":
      return 1;
    case "view":
      return 0.6;
    case "materialized-view":
      return 0.3;
    default:
      return 0.5;
  }
}

/**
 * SPEC-03 §1 — combines the four normalized signals into a single 0-1 importance score.
 * Requires an {@link ImportanceContext} for snapshot-relative normalization of size/centrality.
 */
export function scoreEntity(
  entity: MetadataEntity,
  context: ImportanceContext,
): number {
  const touches = context.touchesByEntityId.get(entity.id) ?? 0;
  const fkNorm = context.maxRelationshipTouches > 0 ? touches / context.maxRelationshipTouches : 0;
  const sizeNorm = context.maxLogSize > 0 ? log10Size(entity) / context.maxLogSize : 0;
  const score =
    IMPORTANCE_WEIGHTS.fkCentrality * fkNorm +
    IMPORTANCE_WEIGHTS.size * sizeNorm +
    IMPORTANCE_WEIGHTS.name * nameSignal(entity) +
    IMPORTANCE_WEIGHTS.kind * kindSignal(entity);
  return Math.max(0, Math.min(1, score));
}

/**
 * Scores every entity, mutates `entity.importanceScore` in place, and returns a NEW array sorted by
 * descending importance (stable by id). Callers iterate the returned order in every enrichment stage.
 */
export function scoreAndRankEntities(
  entities: MetadataEntity[],
  relationships: MetadataRelationship[],
): MetadataEntity[] {
  const context = buildImportanceContext(entities, relationships);
  for (const entity of entities) {
    entity.importanceScore = scoreEntity(entity, context);
  }
  return byImportance(entities);
}

/** Returns entities ordered by descending importanceScore, breaking ties deterministically by id. */
export function byImportance(entities: MetadataEntity[]): MetadataEntity[] {
  return [...entities].sort((left, right) => {
    const delta = (right.importanceScore ?? 0) - (left.importanceScore ?? 0);
    if (delta !== 0) return delta;
    return left.id.localeCompare(right.id);
  });
}
