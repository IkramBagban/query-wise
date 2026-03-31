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
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_0%,rgba(116,204,99,0.2),transparent_28%),radial-gradient(circle_at_95%_0%,rgba(43,116,57,0.08),transparent_22%),#f4faf2] px-6 py-5">
      <header className="mb-6 flex items-center justify-between px-4 py-3">
        <h1 className="font-syne text-3xl text-text-1">Query<span className="text-[#2ed52e]">Wise</span></h1>
        <span className="rounded-full border border-[#174128]/16 bg-[#effbe9] px-2.5 py-1 text-xs font-semibold text-[#24553a]">View only</span>
      </header>
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {dashboard.widgets.map((widget) => (
          <WidgetCard key={widget.id} widget={widget} readOnly />
        ))}
      </section>
    </main>
  );
}
