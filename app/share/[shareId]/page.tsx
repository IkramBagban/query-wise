import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { WidgetCard } from "@/components/dashboard/WidgetCard";
import type { Dashboard } from "@/types";

async function fetchSharedDashboard(shareId: string): Promise<Dashboard | null> {
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";

  const response = await fetch(`${proto}://${host}/api/share/${shareId}`, {
    cache: "no-store",
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { dashboard?: Dashboard };
  return body.dashboard ?? null;
}

export default async function SharedDashboardPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const dashboard = await fetchSharedDashboard(shareId);

  if (!dashboard) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-bg px-6 py-5">
      <header className="mb-6 flex items-center justify-between border-b border-border pb-4">
        <h1 className="font-syne text-3xl text-text-1">QueryWise</h1>
        <span className="rounded bg-surface-2 px-2 py-1 text-xs text-text-2">View only</span>
      </header>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {dashboard.widgets.map((widget) => (
          <WidgetCard key={widget.id} widget={widget} readOnly />
        ))}
      </section>
      <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-text-3">
        Create your own at querywise.app
      </footer>
    </main>
  );
}
