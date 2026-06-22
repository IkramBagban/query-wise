import { ConversationView } from "@/components/v2/WorkspaceView";

export default async function Page({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <ConversationView conversationId={conversationId} />;
}
