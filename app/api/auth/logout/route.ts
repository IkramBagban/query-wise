import { cookies } from "next/headers";

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  cookieStore.delete("qw_session");

  return Response.json({ success: true });
}
