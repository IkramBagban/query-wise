import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth disabled - no redirect needed
  // Auth enabled version (commented out):
  // const cookieStore = await cookies();
  // const isAuthenticated = cookieStore.get("qw_session")?.value === "authenticated";
  // if (!isAuthenticated) {
  //   redirect("/signin");
  // }

  return children;
}

