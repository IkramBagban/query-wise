import { ConversationView } from "@/components/WorkspaceView";

export default async function Page({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <ConversationView conversationId={conversationId} />;
}
