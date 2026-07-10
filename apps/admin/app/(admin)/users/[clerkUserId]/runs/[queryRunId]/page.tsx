import { PlaceholderPage } from "@/components/placeholder-page";

export default async function RunDebugPage({
  params,
}: {
  params: Promise<{ clerkUserId: string; queryRunId: string }>;
}) {
  const { queryRunId } = await params;
  return (
    <PlaceholderPage
      title="Run debug"
      description={`Content-gated debug view for run ${queryRunId} (SPEC-08 §5.4). Implemented in Phase 5 with interstitial + audit log.`}
    />
  );
}
