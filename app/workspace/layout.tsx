import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("qw_session")?.value === "authenticated";

  if (!isAuthenticated) {
    redirect("/signin");
  }

  return children;
}

