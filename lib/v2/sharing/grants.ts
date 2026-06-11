import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { getAppDb } from "@/lib/v2/app-db";
import { createResourceId } from "@/lib/v2/domain";
import { pendingEmailGrantKey } from "./crypto";

export async function claimPendingEmailGrants(userId: string): Promise<void> {
  let emailKeys: string[];
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    emailKeys = user.emailAddresses.map((address) => pendingEmailGrantKey(address.emailAddress));
  } catch {
    return;
  }
  if (!emailKeys.length) return;

  await getAppDb().$transaction(async (tx) => {
    const pending = await tx.dashboardAccessGrant.findMany({
      where: { recipientUserId: { in: emailKeys } },
      select: { id: true, dashboardId: true },
    });
    for (const grant of pending) {
      await tx.dashboardAccessGrant.upsert({
        where: {
          dashboardId_recipientUserId: {
            dashboardId: grant.dashboardId,
            recipientUserId: userId,
          },
        },
        create: {
          id: createResourceId(),
          dashboardId: grant.dashboardId,
          recipientUserId: userId,
          permission: "view",
        },
        update: { permission: "view" },
      });
      await tx.dashboardAccessGrant.delete({ where: { id: grant.id } });
    }
  });
}
