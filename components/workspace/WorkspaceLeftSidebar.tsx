"use client";

import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  Database,
  Home,
  LayoutDashboard,
  MessageSquareText,
  Plus,
  Settings,
  TrendingUp,
  UserRound,
} from "lucide-react";

import type { Dashboard, QueryHistoryEntry } from "@/types";

interface WorkspaceLeftSidebarProps {
  dashboard: Dashboard;
  history: QueryHistoryEntry[];
  onNewChat: () => void;
  onOpenConnections: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onRerunHistory: (entry: QueryHistoryEntry) => void;
}

const dashboardIcons = [BarChart3, TrendingUp, LayoutDashboard];

export function WorkspaceLeftSidebar({
  dashboard,
  history,
  onNewChat,
  onOpenConnections,
  onOpenSettings,
  onOpenHistory,
  onRerunHistory,
}: WorkspaceLeftSidebarProps) {
  const recentHistory = history.slice(0, 5);

  return (
    <aside className="hidden h-full w-[270px] shrink-0 flex-col border-r border-[#dfe7e2] bg-white lg:flex">
      <div className="flex h-[72px] items-center gap-3 border-b border-[#e5ebe7] px-7">
        <span className="flex size-7 items-end justify-center gap-[3px]" aria-hidden="true">
          <span className="h-3 w-1.5 rounded-sm bg-[#10a957]" />
          <span className="h-5 w-1.5 rounded-sm bg-[#10a957]" />
          <span className="h-7 w-1.5 rounded-sm bg-[#10a957]" />
        </span>
        <span className="font-syne text-[22px] font-bold tracking-[-0.04em]">QueryWise</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
        <nav className="flex flex-col gap-1">
          <button className="flex h-11 items-center gap-3 rounded-lg bg-[#edf7f1] px-4 text-left text-sm font-semibold text-[#163c2a]">
            <Home className="size-[18px] fill-[#16864d] text-[#16864d]" />
            Home
          </button>
          <button
            onClick={onOpenConnections}
            className="flex h-11 items-center gap-3 rounded-lg px-4 text-left text-sm font-medium text-[#263c32] transition hover:bg-[#f4f8f5]"
          >
            <Database className="size-[18px]" />
            Connections
          </button>
          <button
            onClick={onOpenSettings}
            className="flex h-11 items-center gap-3 rounded-lg px-4 text-left text-sm font-medium text-[#263c32] transition hover:bg-[#f4f8f5]"
          >
            <Settings className="size-[18px]" />
            Settings
          </button>
        </nav>

        <button
          onClick={onNewChat}
          className="mt-4 flex h-11 items-center justify-center gap-2 rounded-lg bg-[#078943] text-sm font-semibold text-white shadow-[0_8px_18px_rgba(7,137,67,0.2)] transition hover:bg-[#06783b]"
        >
          <Plus className="size-[18px]" />
          New Chat
        </button>

        <section className="mt-7 border-b border-[#e5ebe7] pb-5">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#52665c]">
            Dashboards
          </h2>
          <div className="mt-2 flex flex-col gap-0.5">
            {[dashboard.name, "Growth & Retention", "Product Performance"].map((name, index) => {
              const Icon = dashboardIcons[index];
              return (
                <Link
                  key={name}
                  href="/dashboard"
                  className="flex h-9 items-center gap-3 rounded-lg px-2 text-[13px] text-[#405249] transition hover:bg-[#f4f8f5]"
                >
                  <Icon className="size-4 text-[#526a5d]" />
                  <span className="truncate">{name}</span>
                </Link>
              );
            })}
          </div>
          <Link
            href="/dashboard"
            className="mt-2 inline-flex items-center gap-2 px-2 text-xs font-semibold text-[#087c3f]"
          >
            See all dashboards <span aria-hidden="true">›</span>
          </Link>
        </section>

        <section className="mt-5 border-b border-[#e5ebe7] pb-5">
          <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#52665c]">
            Chat History
          </h2>
          <div className="mt-2 flex flex-col gap-0.5">
            {recentHistory.length > 0 ? (
              recentHistory.map((entry, index) => (
                <button
                  key={entry.id}
                  onClick={() => onRerunHistory(entry)}
                  className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-left text-[12px] text-[#405249] transition hover:bg-[#f4f8f5] ${
                    index === 0 ? "bg-[#edf7f1]" : ""
                  }`}
                >
                  <MessageSquareText className="size-4 shrink-0 text-[#557064]" />
                  <span className="min-w-0 flex-1 truncate">{entry.question}</span>
                  <span className="shrink-0 text-[10px] text-[#7a8b82]">
                    {index === 0 ? "now" : `${index + 1}h`}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-xs leading-relaxed text-[#7a8b82]">
                Your recent conversations will appear here.
              </p>
            )}
          </div>
          <button
            onClick={onOpenHistory}
            className="mt-2 inline-flex items-center gap-2 px-2 text-xs font-semibold text-[#087c3f]"
          >
            See all history <span aria-hidden="true">›</span>
          </button>
        </section>

        <button className="mt-auto flex items-center gap-3 rounded-xl border border-[#dde6e0] bg-white p-3 text-left shadow-[0_5px_18px_rgba(25,58,40,0.04)]">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#e6f4eb] text-[#087c3f]">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[#17291f]">QueryWise User</span>
            <span className="block text-[11px] font-medium text-[#0a8a46]">Workspace</span>
          </span>
          <ChevronDown className="size-4 text-[#53675d]" />
        </button>
      </div>
    </aside>
  );
}
