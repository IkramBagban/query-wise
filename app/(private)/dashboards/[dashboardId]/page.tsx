import { DashboardDetailView } from "@/components/v2/DashboardsView";

export default async function Page({ params }: { params: Promise<{ dashboardId: string }> }) {
  const { dashboardId } = await params;
  return <div className="p-4 sm:p-6"><DashboardDetailView dashboardId={dashboardId} /></div>;
}
