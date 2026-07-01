import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { ClerkUserId } from "@query-wise/shared/types";
import { AppError } from "@query-wise/shared/dal/core";
import { writeAuditLogBestEffort } from "@/lib/audit";

export interface AuthenticatedUser {
  userId: ClerkUserId;
}

/**
 * Resolves identity from Clerk on the server. API and action callers can map
 * the typed error to the V2 401 response without relying on page redirects.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const { userId } = await auth();

  if (!userId) {
    await writeAuditLogBestEffort({
      actorUserId: null,
      action: "authentication.require-user",
      resourceType: "session",
      outcome: "denied",
    });
    throw new AppError(
      "AUTHENTICATION_REQUIRED",
      "Authentication is required.",
    );
  }

  return { userId };
}
