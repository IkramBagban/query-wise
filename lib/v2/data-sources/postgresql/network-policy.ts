import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { AppError } from "@/lib/v2/dal/core";

function blockedIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") || normalized.startsWith("2001:db8:");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? blockedIpv4(address) : family === 6 ? blockedIpv6(address) : true;
}

export async function enforcePublicEndpoint(host: string): Promise<void> {
  if (host.toLowerCase() === "localhost") {
    throw new AppError("DATA_SOURCE_TARGET_BLOCKED", "The data source target is not publicly routable.");
  }
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new AppError("DATA_SOURCE_UNAVAILABLE", "The data source hostname could not be resolved.", true, error);
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new AppError("DATA_SOURCE_TARGET_BLOCKED", "The data source target is not publicly routable.");
  }
}
