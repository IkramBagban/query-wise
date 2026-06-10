import { randomBytes } from "node:crypto";
import type { ResourceId } from "@/types/v2";

export function createResourceId(now = Date.now()): ResourceId {
  const bytes = randomBytes(16);
  const timestamp = BigInt(now);
  for (let index = 5; index >= 0; index--) bytes[5 - index] = Number((timestamp >> BigInt(index * 8)) & BigInt(255));
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
