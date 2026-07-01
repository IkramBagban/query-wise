export const CONTRACT_VERSION = "querywise.v2" as const;

export type ContractVersion = typeof CONTRACT_VERSION;
export type ResourceId = string;
export type ClerkUserId = string;
export type IsoDateTime = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface DurableResource {
  id: ResourceId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface OwnedResource extends DurableResource {
  ownerUserId: ClerkUserId;
}

export interface SoftDeletableResource {
  deletedAt: IsoDateTime | null;
}

export interface ApiSuccess<T> {
  contractVersion: ContractVersion;
  data: T;
}

export interface MutationAck {
  contractVersion: ContractVersion;
  data: { id: ResourceId; updatedAt: IsoDateTime };
}
