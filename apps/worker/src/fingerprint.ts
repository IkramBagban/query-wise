import { createHash } from "node:crypto";
import type { CanonicalDataSourceMetadata, MetadataEntity, MetadataRelationship } from "@query-wise/shared/types";

function stableEntity(entity: MetadataEntity) {
  return {
    id: entity.id,
    namespace: entity.namespace,
    name: entity.name,
    kind: entity.kind,
    columns: entity.columns
      .map((column) => ({
        name: column.name,
        ordinal: column.ordinal,
        nativeType: column.nativeType,
        canonicalType: column.canonicalType,
        nullable: column.nullable,
        primaryKey: column.primaryKey,
        generated: column.generated,
      }))
      .sort((left, right) => left.ordinal - right.ordinal || left.name.localeCompare(right.name)),
  };
}

function stableRelationship(relationship: MetadataRelationship) {
  return {
    fromEntityId: relationship.fromEntityId,
    fromColumns: [...relationship.fromColumns],
    toEntityId: relationship.toEntityId,
    toColumns: [...relationship.toColumns],
  };
}

export function computeSchemaFingerprint(metadata: CanonicalDataSourceMetadata): string {
  const structuralShape = {
    providerId: metadata.providerId,
    dialectId: metadata.dialectId,
    namespaces: metadata.namespaces.map((namespace) => namespace.name).sort(),
    entities: metadata.entities.map(stableEntity).sort((left, right) => left.id.localeCompare(right.id)),
    relationships: metadata.relationships
      .map(stableRelationship)
      .sort((left, right) => {
        const from = left.fromEntityId.localeCompare(right.fromEntityId);
        if (from !== 0) return from;
        return left.toEntityId.localeCompare(right.toEntityId);
      }),
  };

  return createHash("sha256").update(JSON.stringify(structuralShape)).digest("hex");
}

export function computeEntityFingerprint(entity: MetadataEntity): string {
  return createHash("sha256").update(JSON.stringify(stableEntity(entity))).digest("hex");
}

export function summarizeMetadata(metadata: CanonicalDataSourceMetadata): string {
  return `${metadata.namespaces.length} schemas, ${metadata.entities.length} entities, ${metadata.relationships.length} relationships`;
}
