"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyDashboard } from "@/components/dashboard/EmptyDashboard";
import { ShareModal } from "@/components/dashboard/ShareModal";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import type { ChartType, Dashboard } from "@/types";

function fallbackDashboard(): Dashboard {
  return {
    id: `dash-${Date.now()}`,
    name: "Primary Dashboard",
    widgets: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function DashboardPage() {
  const { pushToast } = useToast();
  const [dashboard, setDashboard] = useState<Dashboard>(fallbackDashboard);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("qw_dashboard");
    if (raw) {
      setDashboard(JSON.parse(raw) as Dashboard);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("qw_dashboard", JSON.stringify(dashboard));
  }, [dashboard]);

  const share = async () => {
    const response = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardId: dashboard.id }),
    });
    if (!response.ok) {
      pushToast({ title: "Share failed", variant: "error" });
      return;
    }
    const body = (await response.json()) as { url: string; shareId: string };
    setShareUrl(body.url);
    setShareModalOpen(true);
    setDashboard((prev) => ({ ...prev, shareId: body.shareId }));
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,rgba(116,204,99,0.2),transparent_28%),radial-gradient(circle_at_95%_0%,rgba(43,116,57,0.08),transparent_22%),#f4faf2] px-6 py-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3  px-4 py-3  ">
        <div className="flex items-center gap-3">
          {/* <input
            value={dashboard.name}
            onChange={(event) => setDashboard((prev) => ({ ...prev, name: event.target.value }))}
            className="min-w-[220px] rounded-lg border border-transparent bg-transparent px-2 py-1 font-syne text-3xl text-text-1 outline-none focus:border-[#174128]/18 focus:bg-[#f6fcf4]"
          /> */}
          {/* {dashboard.shareId ? <span className="rounded-full bg-[#2ed52e]/15 px-2.5 py-1 text-xs font-semibold text-[#1f892d]">Shared</span> : null} */}
        </div>
        <div className="flex gap-2">
          <Button className="bg-[#2ed52e] !text-white hover:brightness-105" onClick={() => void share()}>
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <Link href="/workspace">
            <Button variant="ghost" className="border border-[#174128]/18 bg-white hover:bg-[#ecf9e5]">Back to Workspace</Button>
          </Link>
        </div>
      </header>

      {dashboard.widgets.length === 0 ? (
        <EmptyDashboard />
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {dashboard.widgets.map((widget) => (
            <div key={widget.id} className="cursor-grab active:cursor-grabbing" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", widget.id)} onDrop={(event) => {
              const from = event.dataTransfer.getData("text/plain");
              if (!from || from === widget.id) return;
              setDashboard((prev) => {
                const items = [...prev.widgets];
                const fromIndex = items.findIndex((item) => item.id === from);
                const toIndex = items.findIndex((item) => item.id === widget.id);
                if (fromIndex < 0 || toIndex < 0) return prev;
                const [moved] = items.splice(fromIndex, 1);
                items.splice(toIndex, 0, moved);
                return { ...prev, widgets: items, updatedAt: Date.now() };
              });
            }} onDragOver={(event) => event.preventDefault()}>
              <WidgetCard
                widget={widget}
                onTitleChange={(title) =>
                  setDashboard((prev) => ({
                    ...prev,
                    widgets: prev.widgets.map((item) => (item.id === widget.id ? { ...item, title } : item)),
                  }))
                }
                onTypeChange={(type: ChartType) =>
                  setDashboard((prev) => ({
                    ...prev,
                    widgets: prev.widgets.map((item) =>
                      item.id === widget.id ? { ...item, chartConfig: { ...item.chartConfig, type } } : item,
                    ),
                  }))
                }
                onRemove={() =>
                  setDashboard((prev) => ({
                    ...prev,
                    widgets: prev.widgets.filter((item) => item.id !== widget.id),
                    updatedAt: Date.now(),
                  }))
                }
              />
            </div>
          ))}
        </section>
      )}

      <ShareModal open={shareModalOpen} onOpenChange={setShareModalOpen} url={shareUrl} />
    </main>
  );
}
