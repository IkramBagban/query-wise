import { ConnectionDetailView } from "@/components/ConnectionsView";

export default async function Page({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  return <div className="p-4 sm:p-6"><ConnectionDetailView connectionId={connectionId} /></div>;
}
