import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type { DashboardShareLink, DashboardWidget } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAppDb, withAppDbTransaction } from "@query-wise/shared/app-db";
import { getConnectionSecretForOwner } from "@/lib/connections";
import { requireDashboardAccess } from "@/lib/dal/authorization";
import { AppError, resourceNotFound } from "@query-wise/shared/dal/core";
import { getDataSourceAdapter, requireCapability } from "@query-wise/shared/data-sources";
import { createResourceId } from "@query-wise/shared/domain";
import { createResultPreview } from "@/lib/query";
import { devLogError } from "@query-wise/shared/observability";
import type { EncryptedPayload, ProviderQuery, PublicDashboardDto, WidgetMode } from "@query-wise/shared/types";
import {
  ChartConfigSchema,
  ProviderQuerySchema,
  validationError,
  WidgetLayoutSchema,
} from "@/lib/dashboards";
import { applyRangeMarkers, hasFilterMarkers } from "@/lib/dashboards/filter-binding";
import type { DashboardDateRange, WidgetFilterBinding } from "@query-wise/shared/types";
import {
  createShareToken,
  decryptShareToken,
  encryptShareToken,
  hashSharePassword,
  hashShareToken,
  pendingEmailGrantKey,
  verifySharePassword,
  verifyUnlockCredential,
} from "./crypto";
import { clearPasswordAttempts, consumePasswordAttempts } from "./rate-limit";
import {
  getOrCreatePublicDashboard,
  publicDashboardCacheKey,
} from "./public-dashboard-cache";
import { snapshotPublicWidgets } from "./public-snapshot";
import { writeAuditLog } from "@/lib/audit";
import {
  assertAccountActive,
  assertPasswordShareAllowed,
  assertShareQuota,
  getPlanForUser,
} from "@/lib/plans";
import { recordMetricEvent } from "@query-wise/shared/metrics";

const PUBLIC_WIDGET_CONCURRENCY = 4;
const PUBLIC_DASHBOARD_EXECUTION_BUDGET_MS = 30_000;
const PUBLIC_DASHBOARD_CACHE_TTL_SECONDS = 30;

const CreateShareSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("link"),
      password: z.string().min(10).max(200).optional(),
      expiresAt: z.iso.datetime().optional(),
      // SPEC-13: per-share serving mode. Omitted → defaults to the dashboard's
      // current mode server-side (keeps the common case coherent).
      mode: z.enum(["live", "snapshot"]).optional(),
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

/** SPEC-13: narrow the persisted share `mode` string to the WidgetMode union. */
function shareLinkMode(link: DashboardShareLink): WidgetMode {
  return (link as { mode?: string }).mode === "snapshot" ? "snapshot" : "live";
}

function publicShareUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/shared/${encodeURIComponent(token)}`;
}

function encryptedPayload(value: unknown): EncryptedPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<EncryptedPayload>;
  return payload.version === 1 &&
    payload.algorithm === "aes-256-gcm" &&
    payload.keyId === "v1" &&
    typeof payload.iv === "string" &&
    typeof payload.ciphertext === "string" &&
    typeof payload.authTag === "string"
    ? (payload as EncryptedPayload)
    : null;
}

/**
 * Normalize SQL text for comparison (collapse whitespace).
 * Used during public share refresh to tolerate benign formatting differences
 * while still ensuring the logical query matches the original run.
 */
function queriesMatch(a: ProviderQuery, b: ProviderQuery): boolean {
  if (a.kind !== b.kind || a.dialectId !== b.dialectId) return false;
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  return normalize(a.text) === normalize(b.text);
}

async function linkDto(link: DashboardShareLink, baseUrl: string) {
  const tokenPayload = encryptedPayload(link.encryptedToken);
  const token = tokenPayload ? await decryptShareToken(tokenPayload) : null;
  return {
    id: link.id,
    passwordProtected: Boolean(link.passwordHash),
    mode: shareLinkMode(link),
    version: link.version,
    urlAvailable: Boolean(token),
    url: token ? publicShareUrl(baseUrl, token) : null,
    viewCount: link.viewCount,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: iso(link.createdAt),
    updatedAt: iso(link.updatedAt),
  };
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

export async function listShares(dashboardId: string, baseUrl: string) {
  await requireDashboardAccess(dashboardId, "edit");
  const [links, grants] = await Promise.all([
    getAppDb().dashboardShareLink.findMany({
      where: {
        dashboardId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
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
    links: await Promise.all(links.map((link) => linkDto(link, baseUrl))),
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

export async function createShare(dashboardId: string, input: unknown, baseUrl: string) {
  const parsed = CreateShareSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const dashboard = await requireDashboardAccess(dashboardId, "edit");

  if (parsed.data.type === "grant") {
    const recipient = await resolveGrantRecipient(parsed.data);
    const grant = await withAppDbTransaction(async (tx) => {
      const created = await tx.dashboardAccessGrant.upsert({
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
      await writeAuditLog({
        actorUserId: dashboard.ownerUserId,
        action: "dashboard.share.create",
        resourceType: "dashboard-access-grant",
        resourceId: created.id,
        outcome: "succeeded",
        metadata: { dashboardId, shareType: "grant", recipientKind: recipient.kind },
      }, tx);
      return created;
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

  // Plan gate for public share links: fail closed for disabled accounts, enforce
  // the active-share-link cap, and gate password protection behind Pro.
  const sharePlan = await getPlanForUser(dashboard.ownerUserId);
  assertAccountActive(sharePlan);
  if (parsed.data.password && !sharePlan.limits.allowPasswordShares) {
    void recordMetricEvent({
      userId: dashboard.ownerUserId,
      eventType: "share.password_rejected_by_plan",
      resourceType: "dashboard",
      resourceId: dashboardId,
    });
  }
  assertPasswordShareAllowed(sharePlan, Boolean(parsed.data.password));
  await assertShareQuota(dashboard.ownerUserId, sharePlan);

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    throw validationError();
  }
  const token = createShareToken();
  const encryptedToken = await encryptShareToken(token);
  const passwordHash = parsed.data.password
    ? await hashSharePassword(parsed.data.password)
    : null;
  // SPEC-13: default the share's serving mode to the dashboard's current mode when
  // the owner didn't pick one explicitly.
  const mode: WidgetMode =
    parsed.data.mode ?? ((dashboard as { mode?: string }).mode === "snapshot" ? "snapshot" : "live");
  const link = await withAppDbTransaction(async (tx) => {
    const created = await tx.dashboardShareLink.create({
      data: {
        id: createResourceId(),
        dashboardId,
        tokenHash: hashShareToken(token),
        encryptedToken: encryptedToken as unknown as Prisma.InputJsonValue,
        passwordHash,
        mode,
        expiresAt,
      },
    });
    await writeAuditLog({
      actorUserId: dashboard.ownerUserId,
      action: "dashboard.share.create",
      resourceType: "dashboard-share-link",
      resourceId: created.id,
      outcome: "succeeded",
      metadata: {
        dashboardId,
        shareType: "link",
        passwordProtected: Boolean(passwordHash),
        expires: Boolean(expiresAt),
        mode,
      },
    }, tx);
    return created;
  });
  void recordMetricEvent({
    userId: dashboard.ownerUserId,
    eventType: "share.created",
    resourceType: "dashboard-share-link",
    resourceId: link.id,
    payload: { dashboardId, passwordProtected: Boolean(link.passwordHash), expires: Boolean(expiresAt), mode },
  });
  return {
    type: "link" as const,
    link: {
      id: link.id,
      url: publicShareUrl(baseUrl, token),
      urlAvailable: true,
      passwordProtected: Boolean(link.passwordHash),
      mode,
      version: link.version,
      viewCount: link.viewCount,
      lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      createdAt: iso(link.createdAt),
      updatedAt: iso(link.updatedAt),
    },
  };
}

export async function revokeShare(dashboardId: string, shareId: string): Promise<void> {
  const dashboard = await requireDashboardAccess(dashboardId, "edit");
  await getAppDb().$transaction(async (tx) => {
    const link = await tx.dashboardShareLink.updateMany({
      where: { id: shareId, dashboardId, revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    let resourceType = "dashboard-share-link";
    if (link.count !== 1) {
      const grant = await tx.dashboardAccessGrant.deleteMany({
        where: { id: shareId, dashboardId },
      });
      if (grant.count !== 1) throw resourceNotFound();
      resourceType = "dashboard-access-grant";
    }
    await writeAuditLog({
      actorUserId: dashboard.ownerUserId,
      action: "dashboard.share.revoke",
      resourceType,
      resourceId: shareId,
      outcome: "succeeded",
      metadata: { dashboardId },
    }, tx);
  });
  void recordMetricEvent({
    userId: dashboard.ownerUserId,
    eventType: "share.revoked",
    resourceType: "dashboard-share-link",
    resourceId: shareId,
    payload: { dashboardId },
  });
}

export async function updateShareLink(
  dashboardId: string,
  shareId: string,
  input: unknown,
) {
  const parsed = UpdateLinkSchema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  const dashboard = await requireDashboardAccess(dashboardId, "edit");
  // Setting a password on an existing link is a Pro feature; block it for Free so
  // the create-time gate cannot be bypassed via update. Disabled accounts too.
  const updatePlan = await getPlanForUser(dashboard.ownerUserId);
  assertAccountActive(updatePlan);
  assertPasswordShareAllowed(
    updatePlan,
    typeof parsed.data.password === "string" && parsed.data.password.length > 0,
  );
  const expiresAt =
    parsed.data.expiresAt === undefined
      ? undefined
      : parsed.data.expiresAt === null
        ? null
        : new Date(parsed.data.expiresAt);
  if (expiresAt && expiresAt <= new Date()) throw validationError();
  const passwordHash = parsed.data.password === undefined
    ? undefined
    : parsed.data.password === null
      ? null
      : await hashSharePassword(parsed.data.password);
  const link = await withAppDbTransaction(async (tx) => {
    const result = await tx.dashboardShareLink.updateMany({
      where: { id: shareId, dashboardId, revokedAt: null },
      data: { passwordHash, expiresAt, version: { increment: 1 } },
    });
    if (result.count !== 1) throw resourceNotFound();
    const updated = await tx.dashboardShareLink.findUnique({ where: { id: shareId } });
    if (!updated) throw resourceNotFound();
    await writeAuditLog({
      actorUserId: dashboard.ownerUserId,
      action: "dashboard.share.update",
      resourceType: "dashboard-share-link",
      resourceId: shareId,
      outcome: "succeeded",
      metadata: {
        dashboardId,
        passwordChanged: parsed.data.password !== undefined,
        expiryChanged: parsed.data.expiresAt !== undefined,
      },
    }, tx);
    return updated;
  });
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

function publicShareExpired(): AppError {
  return new AppError("SHARE_EXPIRED", "This link has expired.");
}

async function activeShare(token: string): Promise<DashboardShareLink> {
  if (token.length < 32 || token.length > 200) throw publicShareNotFound();
  const share = await getAppDb().dashboardShareLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
  });
  if (!share || share.revokedAt) throw publicShareNotFound();
  if (share.expiresAt && share.expiresAt <= new Date()) throw publicShareExpired();
  const dashboard = await getAppDb().dashboard.findFirst({
    where: { id: share.dashboardId, deletedAt: null },
    select: { id: true },
  });
  if (!dashboard) throw publicShareNotFound();
  return share;
}

function widgetFilterBinding(widget: DashboardWidget): WidgetFilterBinding | null {
  const value = widget.filterBinding;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as WidgetFilterBinding;
}

async function executePublicWidget(
  widget: DashboardWidget,
  dashboardOwnerUserId: string,
  deadline: number,
  defaultDateRange: DashboardDateRange | null,
): Promise<PublicDashboardDto["dashboard"]["widgets"][number]> {
  const chartConfig = ChartConfigSchema.parse(widget.chartConfig);
  const layout = WidgetLayoutSchema.parse(widget.layout);
  const base = {
    id: widget.id,
    title: widget.title,
    chartConfig,
    layout,
    viewTransform: widget.viewTransform as unknown as PublicDashboardDto["dashboard"]["widgets"][number]["viewTransform"],
  };
  const query = ProviderQuerySchema.safeParse(widget.queryDefinition);
  if (!widget.queryRunId || !query.success) {
    return {
      ...base,
      result: null,
      error: {
        code: "WIDGET_QUERY_UNAVAILABLE",
        message: "This chart cannot be refreshed because its saved query is unavailable.",
      },
    };
  }
  if (Date.now() >= deadline) {
    return {
      ...base,
      result: null,
      error: {
        code: "WIDGET_QUERY_BUDGET_EXCEEDED",
        message: "This chart could not be refreshed within the shared dashboard time budget.",
      },
    };
  }
  const run = await getAppDb().queryRun.findFirst({
    where: { id: widget.queryRunId, ownerUserId: dashboardOwnerUserId },
    select: {
      ownerUserId: true,
      connectionId: true,
      providerId: true,
      dialectId: true,
      generatedQuery: true,
    },
  });
  if (!run) {
    return {
      ...base,
      result: null,
      error: {
        code: "WIDGET_QUERY_RUN_UNAVAILABLE",
        message: "This chart cannot be refreshed because its query run is unavailable.",
      },
    };
  }
  // SPEC-06 §5: filter-bound widgets store the query with :qw_from/:qw_to markers,
  // so it intentionally differs from the run's SQL. For those we substitute the
  // dashboard's default range and re-validate through the read-only policy below
  // (which is the safety guarantee); the exact-match guard applies only to
  // unbound widgets, preserving today's tamper protection.
  const markerBound = hasFilterMarkers(query.data.text);
  const generatedQuery = ProviderQuerySchema.safeParse(run.generatedQuery);
  if (
    !markerBound &&
    (run.dialectId !== query.data.dialectId ||
      !generatedQuery.success ||
      generatedQuery.data.kind !== query.data.kind ||
      generatedQuery.data.dialectId !== query.data.dialectId ||
      !queriesMatch(generatedQuery.data, query.data))
  ) {
    return {
      ...base,
      result: null,
      error: {
        code: "WIDGET_QUERY_MISMATCH",
        message: "This chart cannot be refreshed because its saved query no longer matches the original run.",
      },
    };
  }
  try {
    const { record, secret } = await getConnectionSecretForOwner(run.connectionId, run.ownerUserId);
    const adapter = getDataSourceAdapter(record.providerId);
    requireCapability(adapter, "sql-validation");
    requireCapability(adapter, "read-sql-execution");
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return {
        ...base,
        result: null,
        error: {
          code: "WIDGET_QUERY_BUDGET_EXCEEDED",
          message: "This chart could not be refreshed within the shared dashboard time budget.",
        },
      };
    }
    let executable: ProviderQuery = query.data as ProviderQuery;
    if (markerBound) {
      const boundText = applyRangeMarkers(query.data.text, widgetFilterBinding(widget), defaultDateRange);
      const validation = await adapter.validateQuery(
        { kind: "sql", dialectId: query.data.dialectId, text: boundText },
        {
          schemaVersion: 1,
          readOnly: true,
          singleStatement: true,
          blockComments: true,
          blockSystemCatalogs: true,
          maxExecutionMs: 15_000,
          maxReturnedRows: 500,
        },
      );
      if (!validation.valid || !validation.normalizedQuery) {
        return {
          ...base,
          result: null,
          error: {
            code: "WIDGET_QUERY_MISMATCH",
            message: "This chart cannot be refreshed because its saved query is no longer valid.",
          },
        };
      }
      executable = validation.normalizedQuery;
    }
    const result = await adapter.executeReadQuery(
      record.id,
      record.credentialVersion,
      secret,
      executable,
      {
        timeoutMs: Math.min(15_000, remainingMs),
        maxRows: 500,
        maxBytes: 2 * 1024 * 1024,
      },
    );
    return { ...base, result: createResultPreview(result), error: null };
  } catch (error) {
    const code = error instanceof AppError ? error.code : "WIDGET_QUERY_EXECUTION_FAILED";
    return {
      ...base,
      result: null,
      error: {
        code,
        message:
          code === "DATA_SOURCE_UNAVAILABLE"
            ? "This chart cannot be refreshed because the connected data source is unavailable."
            : "This chart could not be refreshed.",
      },
    };
  }
}

async function executePublicWidgets(
  widgets: DashboardWidget[],
  dashboardOwnerUserId: string,
  defaultDateRange: DashboardDateRange | null,
): Promise<PublicDashboardDto["dashboard"]["widgets"]> {
  const results = new Array<PublicDashboardDto["dashboard"]["widgets"][number]>(widgets.length);
  const deadline = Date.now() + PUBLIC_DASHBOARD_EXECUTION_BUDGET_MS;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < widgets.length) {
      const index = nextIndex++;
      try {
        results[index] = await executePublicWidget(
          widgets[index],
          dashboardOwnerUserId,
          deadline,
          defaultDateRange,
        );
      } catch (error) {
        const chartConfig = ChartConfigSchema.safeParse(widgets[index].chartConfig);
        const layout = WidgetLayoutSchema.safeParse(widgets[index].layout);
        // Invalid persisted presentation data cannot satisfy the public DTO contract.
        if (!chartConfig.success || !layout.success) throw error;
        results[index] = {
          id: widgets[index].id,
          title: widgets[index].title,
          chartConfig: chartConfig.data,
          layout: layout.data,
          viewTransform: widgets[index].viewTransform as unknown as PublicDashboardDto["dashboard"]["widgets"][number]["viewTransform"],
          result: null,
          error: {
            code: "WIDGET_QUERY_EXECUTION_FAILED",
            message: "This chart could not be refreshed.",
          },
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PUBLIC_WIDGET_CONCURRENCY, widgets.length) }, () => worker()),
  );
  return results;
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
  const widgetsUpdatedAt = widgets.reduce<Date | null>(
    (latest, widget) => (!latest || widget.updatedAt > latest ? widget.updatedAt : latest),
    null,
  );
  const cacheKey = publicDashboardCacheKey({
    shareId: share.id,
    shareVersion: share.version,
    dashboardUpdatedAt: dashboard.updatedAt,
    widgetsUpdatedAt,
  });
  const secondsUntilExpiry = share.expiresAt
    ? Math.max(1, Math.floor((share.expiresAt.getTime() - Date.now()) / 1_000))
    : PUBLIC_DASHBOARD_CACHE_TTL_SECONDS;
  const dto = await getOrCreatePublicDashboard(
    cacheKey,
    Math.min(PUBLIC_DASHBOARD_CACHE_TTL_SECONDS, secondsUntilExpiry),
    async () => {
      // SPEC-13: snapshot-mode shares serve persisted widget snapshots with no
      // SQL/credential access; live-mode shares keep the existing execute path.
      const publicWidgets =
        shareLinkMode(share) === "snapshot"
          ? snapshotPublicWidgets(widgets)
          : await executePublicWidgets(widgets, dashboard.ownerUserId, null);
      const generated: PublicDashboardDto = {
        contractVersion: "querywise.v2",
        dashboard: {
          name: dashboard.name,
          updatedAt: iso(dashboard.updatedAt),
          widgets: publicWidgets,
        },
        share: { expiresAt: share.expiresAt?.toISOString() ?? null },
      };
      if (Buffer.byteLength(JSON.stringify(generated), "utf8") > 2 * 1024 * 1024) {
        throw new AppError("RESULT_LIMIT_EXCEEDED", "Shared dashboard exceeds the response limit.");
      }
      return generated;
    },
  );

  // Best-effort side effect: increment viewCount and update lastViewedAt for the share link.
  // We intentionally do NOT await-fail here. A transient DB pool issue (common on Neon in dev
  // or under load) must never turn a successful public dashboard payload into a 500 for viewers.
  getAppDb()
    .dashboardShareLink.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch((err) => {
      devLogError(
        "public-dashboard.viewcount-increment-failed",
        "Best-effort public share view count / lastViewedAt increment failed (non-fatal).",
        err,
      );
    });

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
