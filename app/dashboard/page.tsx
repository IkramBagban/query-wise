"use client";

import Link from "next/link";
import { Share2 } from "lucide-react";
import { useState } from "react";

import { useAppState } from "@/components/providers/AppStateProvider";
import { EmptyDashboard } from "@/components/dashboard/EmptyDashboard";
import { ShareModal } from "@/components/dashboard/ShareModal";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/hooks/useToast";
import type { DashboardWidget } from "@/types";

export default function DashboardPage() {
  const { pushToast } = useToast();
  const { dashboard, setDashboard } = useAppState();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [removeTarget, setRemoveTarget] = useState<DashboardWidget | null>(null);

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

  const confirmRemoveWidget = () => {
    if (!removeTarget) return;
    setDashboard((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((item) => item.id !== removeTarget.id),
      updatedAt: Date.now(),
    }));
    setRemoveTarget(null);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,rgba(116,204,99,0.2),transparent_28%),radial-gradient(circle_at_95%_0%,rgba(43,116,57,0.08),transparent_22%),#f4faf2] px-6 py-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-syne text-2xl font-bold tracking-tight">
            Query<span className="text-[#2ed52e]">Wise</span>
          </span>
          <nav className="ml-1 hidden items-center gap-1 rounded-full border border-[#174128]/16 bg-white p-1 md:flex">
            <span className="rounded-full bg-[#e7f6de] px-3 py-1.5 text-xs font-semibold text-[#174128]">Dashboard</span>
            <Link href="/workspace" className="rounded-full px-3 py-1.5 text-xs font-semibold text-[#2d4f39] hover:bg-[#ecf9e5]">
              Workspace
            </Link>
          </nav>
        </div>
        <div className="flex gap-2">
          <Button className="bg-[#2ed52e] !text-white hover:brightness-105" onClick={() => void share()}>
            <Share2 className="h-4 w-4" /> Share
          </Button>
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
                onRemove={() => setRemoveTarget(widget)}
              />
            </div>
          ))}
        </section>
      )}

      <ShareModal open={shareModalOpen} onOpenChange={setShareModalOpen} url={shareUrl} />
      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        panelClassName="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text-1">Remove widget?</h2>
            <p className="text-sm text-text-2">
              This will remove the saved chart from your dashboard.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRemoveWidget}>
              Remove
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
