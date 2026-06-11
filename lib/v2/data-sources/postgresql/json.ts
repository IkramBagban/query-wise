import "server-only";

import type { JsonValue, MetadataColumn } from "@/types/v2";

export function canonicalType(nativeType: string): MetadataColumn["canonicalType"] {
  const type = nativeType.toLowerCase();
  if (["16"].includes(type)) return "boolean";
  if (["20", "21", "23", "26"].includes(type)) return "integer";
  if (["700", "701", "790", "1700"].includes(type)) return "decimal";
  if (["1082"].includes(type)) return "date";
  if (["1083", "1266"].includes(type)) return "time";
  if (["1114", "1184"].includes(type)) return "datetime";
  if (["114", "3802"].includes(type)) return "json";
  if (["17", "1560", "1562"].includes(type)) return "binary";
  if (["2950"].includes(type)) return "uuid";
  if (["18", "19", "25", "1042", "1043"].includes(type)) return "string";
  if (type === "boolean") return "boolean";
  if (/smallint|integer|bigint/.test(type)) return "integer";
  if (/numeric|decimal|real|double precision|money/.test(type)) return "decimal";
  if (type === "date") return "date";
  if (type.startsWith("time ") || type === "time") return "time";
  if (/timestamp/.test(type)) return "datetime";
  if (/json/.test(type)) return "json";
  if (/bytea|bit/.test(type)) return "binary";
  if (type === "uuid") return "uuid";
  if (/char|text|citext|enum|inet|cidr|macaddr/.test(type)) return "string";
  return "unknown";
}

export function jsonValue(value: unknown): JsonValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, jsonValue(nested)]));
  }
  return String(value);
}
