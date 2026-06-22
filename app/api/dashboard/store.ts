import { nanoid } from "nanoid";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Dashboard } from "@/types";

interface PersistedStore {
  dashboards: StoredDashboard[];
  shares: Array<[string, string]>;
}

interface DashboardStore {
  loaded: boolean;
  dashboards: Map<string, StoredDashboard>;
  shares: Map<string, string>;
}

interface StoredDashboard extends Dashboard {
  ownerId: string;
}

const PRIMARY_FILE = "/tmp/querywise-dashboards.json";
const FALLBACK_FILE = path.join(os.tmpdir(), "querywise-dashboards.json");
const STORE_FILE = process.platform === "win32" ? FALLBACK_FILE : PRIMARY_FILE;

const store: DashboardStore = {
  loaded: false,
  dashboards: new Map<string, StoredDashboard>(),
  shares: new Map<string, string>(),
};

function toDashboard({ ownerId: _ownerId, ...dashboard }: StoredDashboard): Dashboard {
  return dashboard;
}

async function ensureLoaded(): Promise<void> {
  if (store.loaded) return;
  store.loaded = true;

  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as PersistedStore;

    for (const dashboard of parsed.dashboards ?? []) {
      // Ownerless records predate authentication and cannot be safely claimed.
      if (dashboard.ownerId) store.dashboards.set(dashboard.id, dashboard);
    }
    for (const [shareId, dashboardId] of parsed.shares ?? []) {
      store.shares.set(shareId, dashboardId);
    }
  } catch {
    // Fresh start when no file exists or file cannot be parsed.
  }
}

async function persist(): Promise<void> {
  const payload: PersistedStore = {
    dashboards: [...store.dashboards.values()],
    shares: [...store.shares.entries()],
  };

  await mkdir(path.dirname(STORE_FILE), { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(payload), "utf8");
}

export async function upsertDashboard(ownerId: string, input: Dashboard): Promise<Dashboard | null> {
  await ensureLoaded();

  const existing = store.dashboards.get(input.id);
  if (existing && existing.ownerId !== ownerId) return null;
  const now = Date.now();
  const dashboard: StoredDashboard = {
    ...input,
    ownerId,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    shareId: input.shareId ?? existing?.shareId,
  };

  store.dashboards.set(dashboard.id, dashboard);
  await persist();
  return toDashboard(dashboard);
}

export async function getDashboardById(ownerId: string, id: string): Promise<Dashboard | null> {
  await ensureLoaded();
  const dashboard = store.dashboards.get(id);
  return dashboard?.ownerId === ownerId ? toDashboard(dashboard) : null;
}

export async function getDashboardByShareId(
  shareId: string,
): Promise<Dashboard | null> {
  await ensureLoaded();
  const dashboardId = store.shares.get(shareId);
  if (!dashboardId) return null;
  const dashboard = store.dashboards.get(dashboardId);
  return dashboard ? toDashboard(dashboard) : null;
}

export async function createOrGetShareId(
  ownerId: string,
  dashboardId: string,
): Promise<{ shareId: string; dashboard: Dashboard } | null> {
  await ensureLoaded();

  const dashboard = store.dashboards.get(dashboardId);
  if (!dashboard || dashboard.ownerId !== ownerId) return null;

  if (dashboard.shareId) {
    store.shares.set(dashboard.shareId, dashboard.id);
    return { shareId: dashboard.shareId, dashboard: toDashboard(dashboard) };
  }

  const shareId = nanoid(12);
  const updatedDashboard: StoredDashboard = {
    ...dashboard,
    shareId,
    updatedAt: Date.now(),
  };

  store.shares.set(shareId, dashboard.id);
  store.dashboards.set(dashboard.id, updatedDashboard);
  await persist();

  return { shareId, dashboard: toDashboard(updatedDashboard) };
}
