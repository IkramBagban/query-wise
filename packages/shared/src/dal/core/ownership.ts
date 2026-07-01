import type { ClerkUserId, ResourceId } from "../../types";

export interface OwnerScope {
  id: ResourceId;
  ownerUserId: ClerkUserId;
}

export interface ActiveOwnerScope extends OwnerScope {
  deletedAt: null;
}

export function ownedResourceWhere(ownerUserId: ClerkUserId, id: ResourceId): OwnerScope {
  return { id, ownerUserId };
}

export function activeOwnedResourceWhere(ownerUserId: ClerkUserId, id: ResourceId): ActiveOwnerScope {
  return { ...ownedResourceWhere(ownerUserId, id), deletedAt: null };
}
