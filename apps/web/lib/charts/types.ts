export type ColumnKind = "date" | "numeric" | "text";

export type ColumnProfile = {
  kind: ColumnKind;
  distinctCount: number;
  nonNullCount: number;
  likelyId: boolean;
};
