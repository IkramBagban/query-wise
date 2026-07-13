import "server-only";

/**
 * Clerk identity resolution for admin displays (SPEC-08 §4.2).
 * Best-effort: failures fall back to the raw Clerk id. Never blocks page render.
 */

export interface ClerkIdentity {
  userId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  createdAt: Date | null;
}

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { value: ClerkIdentity; expiresAt: number }>();

function fromCache(userId: string): ClerkIdentity | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return hit.value;
}

function putCache(identity: ClerkIdentity): void {
  cache.set(identity.userId, {
    value: identity,
    expiresAt: Date.now() + TTL_MS,
  });
}

function mapUser(user: {
  id: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: Array<{ emailAddress: string }>;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string;
  createdAt?: number | Date | null;
}): ClerkIdentity {
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    null;
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const name = user.fullName ?? (joined || null);
  const createdAt =
    user.createdAt == null
      ? null
      : user.createdAt instanceof Date
        ? user.createdAt
        : new Date(user.createdAt);
  return {
    userId: user.id,
    email,
    name: name || null,
    imageUrl: user.imageUrl ?? null,
    createdAt,
  };
}

/** Resolve a batch of Clerk ids → display identity. Missing ids are omitted. */
export async function resolveClerkUsers(
  userIds: string[],
): Promise<Map<string, ClerkIdentity>> {
  const out = new Map<string, ClerkIdentity>();
  const missing: string[] = [];

  for (const id of userIds) {
    if (!id) continue;
    const cached = fromCache(id);
    if (cached) out.set(id, cached);
    else missing.push(id);
  }

  if (missing.length === 0) return out;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    // Clerk batches up to 100 user ids per call.
    const chunkSize = 100;
    for (let i = 0; i < missing.length; i += chunkSize) {
      const chunk = missing.slice(i, i + chunkSize);
      const list = await client.users.getUserList({
        userId: chunk,
        limit: chunk.length,
      });
      for (const user of list.data) {
        const identity = mapUser(user);
        putCache(identity);
        out.set(identity.userId, identity);
      }
    }
  } catch {
    // Identity is best-effort — pages render with raw ids.
  }

  return out;
}

/** Search Clerk by email; returns matching user ids (for admin user search). */
export async function searchClerkUserIdsByEmail(
  email: string,
): Promise<string[]> {
  const trimmed = email.trim();
  if (!trimmed) return [];
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const list = await client.users.getUserList({
      emailAddress: [trimmed],
      limit: 20,
    });
    const ids: string[] = [];
    for (const user of list.data) {
      const identity = mapUser(user);
      putCache(identity);
      ids.push(identity.userId);
    }
    return ids;
  } catch {
    return [];
  }
}

export function displayName(identity: ClerkIdentity | undefined, userId: string): string {
  if (!identity) return userId;
  return identity.name || identity.email || userId;
}
