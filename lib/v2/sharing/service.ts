import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type { DashboardShareLink } from "@prisma/client";
import { z } from "zod";
import { getAppDb } from "@/lib/v2/app-db";
import { requireDashboardAccess } from "@/lib/v2/dal/authorization";
import { AppError, resourceNotFound } from "@/lib/v2/dal/core";
import { createResourceId } from "@/lib/v2/domain";
import type { PublicDashboardDto } from "@/types/v2";
import {
  BoundedSnapshotSchema,
  ChartConfigSchema,
  validationError,
  WidgetLayoutSchema,
} from "@/lib/v2/dashboards";
import {
  createShareToken,
  hashSharePassword,
  hashShareToken,
  pendingEmailGrantKey,
  verifySharePassword,
  verifyUnlockCredential,
} from "./crypto";
import { clearPasswordAttempts, consumePasswordAttempts } from "./rate-limit";

const CreateShareSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("link"),
      password: z.string().min(10).max(200).optional(),
      expiresAt: z.iso.datetime().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("grant"),
      recipientUserId: z.string().min(1).max(200).optional(),
      recipientEmail: z.email().max(320).optional(),
    })
    .strict()
    .refine(
      (value) => Boolean(value.recipientUserId) !== Boolean(value.recipientEmail),
      "Provide exactly one recipient.",
    ),
]);
const UpdateLinkSchema = z
  .object({
    password: z.string().min(10).max(200).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "No share changes supplied.");

function iso(value: Date): string {
  return value.toISOString();
}

async function resolveGrantRecipient(input: {
  recipientUserId?: string;
  recipientEmail?: string;
}): Promise<{ key: string; kind: "user" | "pending-email" }> {
  if (input.recipientUserId) return { key: input.recipientUserId, kind: "user" };
  const email = input.recipientEmail!.trim().toLowerCase();
  const users = await (await clerkClient()).users.getUserList({
    emailAddress: [email],
    limit: 2,
  });
  const exact = users.data.find((user) =>
    user.emailAddresses.some(
      (address) =>
        address.verification?.status === "verified" &&
        address.emailAddress.toLowerCase() === email,
    ),
  );
  return exact
    ? { key: exact.id, kind: "user" }
    : { key: pendingEmailGrantKey(email), kind: "pending-email" };
}

export async function listShares(dashboardId: string) {
  await requireDashboardAccess(dashboardId, "edit");
  const [links, grants] = await Promise.all([
    getAppDb().dashboardShareLink.findMany({
      where: { dashboardId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    getAppDb().dashboardAccessGrant.findMany({
      where: { dashboardId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  return {
    links: links.map((link) => ({
      id: link.id,
      passwordProtected: Boolean(link.passwordHash),
      version: link.version,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      revokedAt: link.revokedAt?.toISOString() ?? null,
      createdAt: iso(link.createdAt),
      updatedAt: iso(link.updatedAt),
    })),
    grants: grants.map((grant) => ({
      id: grant.id,
      recipient:
        grant.recipientUserId.startsWith("pending-email-sha256:")
          ? { kind: "pending-email" as const }
          : { kind: "user" as const, userId: grant.recipientUserId },
      permission: "view" as const,
      createdAt: iso(grant.createdAt),
      updatedAt: iso(grant.updatedAt),
    })),
  };
}

export async function createShare(dashboardId: string, input: unknown) {
  const parsed = CreateShareSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  await requireDashboardAccess(dashboardId, "edit");

  if (parsed.data.type === "grant") {
    const recipient = await resolveGrantRecipient(parsed.data);
    const grant = await getAppDb().dashboardAccessGrant.upsert({
      where: {
        dashboardId_recipientUserId: {
          dashboardId,
          recipientUserId: recipient.key,
        },
      },
      create: {
        id: createResourceId(),
        dashboardId,
        recipientUserId: recipient.key,
        permission: "view",
      },
      update: { permission: "view" },
    });
    return {
      type: "grant" as const,
      grant: {
        id: grant.id,
        recipient:
          recipient.kind === "user"
            ? { kind: "user" as const, userId: recipient.key }
            : { kind: "pending-email" as const },
        permission: "view" as const,
        createdAt: iso(grant.createdAt),
        updatedAt: iso(grant.updatedAt),
      },
    };
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    throw validationError();
  }
  const token = createShareToken();
  const link = await getAppDb().dashboardShareLink.create({
    data: {
      id: createResourceId(),
      dashboardId,
      tokenHash: hashShareToken(token),
      passwordHash: parsed.data.password
        ? await hashSharePassword(parsed.data.password)
        : null,
      expiresAt,
    },
  });
  return {
    type: "link" as const,
    link: {
      id: link.id,
      token,
      passwordProtected: Boolean(link.passwordHash),
      version: link.version,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      createdAt: iso(link.createdAt),
    },
  };
}

export async function revokeShare(dashboardId: string, shareId: string): Promise<void> {
  await requireDashboardAccess(dashboardId, "edit");
  await getAppDb().$transaction(async (tx) => {
    const link = await tx.dashboardShareLink.updateMany({
      where: { id: shareId, dashboardId, revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    if (link.count === 1) return;
    const grant = await tx.dashboardAccessGrant.deleteMany({
      where: { id: shareId, dashboardId },
    });
    if (grant.count !== 1) throw resourceNotFound();
  });
}

export async function updateShareLink(
  dashboardId: string,
  shareId: string,
  input: unknown,
) {
  const parsed = UpdateLinkSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  await requireDashboardAccess(dashboardId, "edit");
  const expiresAt =
    parsed.data.expiresAt === undefined
      ? undefined
      : parsed.data.expiresAt === null
        ? null
        : new Date(parsed.data.expiresAt);
  if (expiresAt && expiresAt <= new Date()) throw validationError();
  const result = await getAppDb().dashboardShareLink.updateMany({
    where: { id: shareId, dashboardId, revokedAt: null },
    data: {
      passwordHash:
        parsed.data.password === undefined
          ? undefined
          : parsed.data.password === null
            ? null
            : await hashSharePassword(parsed.data.password),
      expiresAt,
      version: { increment: 1 },
    },
  });
  if (result.count !== 1) throw resourceNotFound();
  const link = await getAppDb().dashboardShareLink.findUnique({ where: { id: shareId } });
  if (!link) throw resourceNotFound();
  return {
    id: link.id,
    passwordProtected: Boolean(link.passwordHash),
    version: link.version,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    updatedAt: iso(link.updatedAt),
  };
}

function publicShareNotFound(): AppError {
  return new AppError(
    "SHARE_REVOKED_OR_NOT_FOUND",
    "The shared dashboard was not found.",
  );
}

async function activeShare(token: string): Promise<DashboardShareLink> {
  if (token.length < 32 || token.length > 200) throw publicShareNotFound();
  const share = await getAppDb().dashboardShareLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
  });
  if (!share || share.revokedAt || (share.expiresAt && share.expiresAt <= new Date())) {
    throw publicShareNotFound();
  }
  const dashboard = await getAppDb().dashboard.findFirst({
    where: { id: share.dashboardId, deletedAt: null },
    select: { id: true },
  });
  if (!dashboard) throw publicShareNotFound();
  return share;
}

export async function getPublicDashboard(
  token: string,
  unlockCredential?: string,
): Promise<PublicDashboardDto> {
  const share = await activeShare(token);
  if (
    share.passwordHash &&
    !verifyUnlockCredential(unlockCredential, share.id, share.version)
  ) {
    throw new AppError("SHARE_PASSWORD_REQUIRED", "A share password is required.");
  }
  const dashboard = await getAppDb().dashboard.findFirst({
    where: { id: share.dashboardId, deletedAt: null },
  });
  if (!dashboard) throw publicShareNotFound();
  const widgets = await getAppDb().dashboardWidget.findMany({
    where: { dashboardId: dashboard.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 51,
  });
  if (widgets.length > 50) {
    throw new AppError("RESULT_LIMIT_EXCEEDED", "Shared dashboard exceeds the widget limit.");
  }
  const dto: PublicDashboardDto = {
    contractVersion: "querywise.v2",
    dashboard: {
      name: dashboard.name,
      updatedAt: iso(dashboard.updatedAt),
      widgets: widgets.map((widget) => ({
        id: widget.id,
        title: widget.title,
        chartConfig: ChartConfigSchema.parse(widget.chartConfig),
        layout: WidgetLayoutSchema.parse(widget.layout),
        result: BoundedSnapshotSchema.parse(widget.snapshot) as unknown as PublicDashboardDto["dashboard"]["widgets"][number]["result"],
      })),
    },
    share: { expiresAt: share.expiresAt?.toISOString() ?? null },
  };
  if (Buffer.byteLength(JSON.stringify(dto), "utf8") > 2 * 1024 * 1024) {
    throw new AppError("RESULT_LIMIT_EXCEEDED", "Shared dashboard exceeds the response limit.");
  }
  return dto;
}

export async function unlockShare(
  token: string,
  password: unknown,
  attemptScope: string,
): Promise<DashboardShareLink> {
  const parsed = z.string().min(1).max(200).safeParse(password);
  if (!parsed.success) throw validationError(parsed.error);
  const share = await activeShare(token);
  if (!share.passwordHash) return share;
  const attemptKey = `${share.id}:${attemptScope}`;
  const attemptKeys = [attemptKey, `${share.id}:global`];
  await consumePasswordAttempts(attemptKeys);
  if (!(await verifySharePassword(parsed.data, share.passwordHash))) {
    throw new AppError("SHARE_PASSWORD_INVALID", "The share password is invalid.");
  }
  await clearPasswordAttempts(attemptKeys);
  return share;
}
