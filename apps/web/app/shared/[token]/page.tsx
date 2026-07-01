import { PublicShareView } from "@/components/PublicShareView";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicShareView token={token} />;
}
