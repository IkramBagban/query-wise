import { PublicShareView } from "@/components/v2/PublicShareView";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicShareView token={token} />;
}
