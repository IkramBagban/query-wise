import { nanoid } from "nanoid";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Dashboard } from "@/types";

interface PersistedStore {
  dashboards: Dashboard[];
  shares: Array<[string, string]>;
}

interface DashboardStore {
  loaded: boolean;
  dashboards: Map<string, Dashboard>;
  shares: Map<string, string>;
}

const PRIMARY_FILE = "/tmp/querywise-dashboards.json";
const FALLBACK_FILE = path.join(os.tmpdir(), "querywise-dashboards.json");
const STORE_FILE = process.platform === "win32" ? FALLBACK_FILE : PRIMARY_FILE;

const store: DashboardStore = {
  loaded: false,
  dashboards: new Map<string, Dashboard>(),
  shares: new Map<string, string>(),
};

async function ensureLoaded(): Promise<void> {
  if (store.loaded) return;
  store.loaded = true;

  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as PersistedStore;

    for (const dashboard of parsed.dashboards ?? []) {
      store.dashboards.set(dashboard.id, dashboard);
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

export async function upsertDashboard(input: Dashboard): Promise<Dashboard> {
  await ensureLoaded();

  const existing = store.dashboards.get(input.id);
  const now = Date.now();
  const dashboard: Dashboard = {
    ...input,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    shareId: input.shareId ?? existing?.shareId,
  };

  store.dashboards.set(dashboard.id, dashboard);
  await persist();
  return dashboard;
}

export async function getDashboardById(id: string): Promise<Dashboard | null> {
  await ensureLoaded();
  return store.dashboards.get(id) ?? null;
}

export async function getDashboardByShareId(
  shareId: string,
): Promise<Dashboard | null> {
  await ensureLoaded();
  const dashboardId = store.shares.get(shareId);
  if (!dashboardId) return null;
  return store.dashboards.get(dashboardId) ?? null;
}

export async function createOrGetShareId(
  dashboardId: string,
): Promise<{ shareId: string; dashboard: Dashboard } | null> {
  await ensureLoaded();

  const dashboard = store.dashboards.get(dashboardId);
  if (!dashboard) return null;

  if (dashboard.shareId) {
    store.shares.set(dashboard.shareId, dashboard.id);
    return { shareId: dashboard.shareId, dashboard };
  }

  const shareId = nanoid(12);
  const updatedDashboard: Dashboard = {
    ...dashboard,
    shareId,
    updatedAt: Date.now(),
  };

  store.shares.set(shareId, dashboard.id);
  store.dashboards.set(dashboard.id, updatedDashboard);
  await persist();

  return { shareId, dashboard: updatedDashboard };
}

