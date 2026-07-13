/**
 * Fail-closed admin access control (SPEC-08 §3).
 *
 * Empty/unset ADMIN_CLERK_USER_IDS admits nobody in every environment —
 * including development. There is no bypass.
 *
 * Pure allowlist parsing is import-safe for middleware; requireAdmin is for
 * server layouts, server actions, and query entry points.
 */

export type AdminAccessCode = "ADMIN_NOT_CONFIGURED" | "ADMIN_FORBIDDEN";

export class AdminAccessError extends Error {
  readonly code: AdminAccessCode;

  constructor(code: AdminAccessCode, message?: string) {
    super(message ?? code);
    this.name = "AdminAccessError";
    this.code = code;
  }
}

export type AuthResult = { userId: string | null | undefined };
export type AuthFn = () => Promise<AuthResult>;

/** Env bag used for allowlist reads (tests inject partial objects). */
export type EnvBag = Record<string, string | undefined>;

/**
 * Parse ADMIN_CLERK_USER_IDS: comma-separated Clerk user ids, trimmed.
 * Empty / whitespace-only / unset → [].
 */
export function getAdminAllowlist(env: EnvBag = process.env): string[] {
  return (env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Gate for every admin layout, server action, and query entry point.
 *
 * Matrix (SPEC-08 §11.1):
 * - env unset / empty allowlist → ADMIN_NOT_CONFIGURED (incl. NODE_ENV=development)
 * - no session → ADMIN_FORBIDDEN
 * - session not in allowlist → ADMIN_FORBIDDEN
 * - session in allowlist → { adminClerkUserId }
 */
export async function requireAdmin(options?: {
  getAuth?: AuthFn;
  env?: EnvBag;
}): Promise<{ adminClerkUserId: string }> {
  const env = options?.env ?? process.env;
  const allowlist = getAdminAllowlist(env);

  if (allowlist.length === 0) {
    throw new AdminAccessError(
      "ADMIN_NOT_CONFIGURED",
      "Admin panel is not configured. Set ADMIN_CLERK_USER_IDS.",
    );
  }

  const getAuth = options?.getAuth ?? defaultAuth;
  const { userId } = await getAuth();

  if (!userId || !allowlist.includes(userId)) {
    throw new AdminAccessError(
      "ADMIN_FORBIDDEN",
      "Admin access denied.",
    );
  }

  return { adminClerkUserId: userId };
}

async function defaultAuth(): Promise<AuthResult> {
  const { auth } = await import("@clerk/nextjs/server");
  return auth();
}
