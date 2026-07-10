import { PlaceholderPage } from "@/components/placeholder-page";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ clerkUserId: string }>;
}) {
  const { clerkUserId } = await params;
  return (
    <PlaceholderPage
      title="User detail"
      description={`Plan, usage, resources, and actions for user ${clerkUserId} (SPEC-08 §5.3). Data surfaces land in Phase 2–3.`}
    />
  );
}
