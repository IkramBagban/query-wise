import { redirect } from "next/navigation";

export default async function RootPage() {
  // Auth disabled - redirect directly to dashboard
  redirect("/dashboard");
  
  // Auth enabled version (commented out):
  // const cookieStore = await cookies();
  // const isAuthenticated = cookieStore.get("qw_session")?.value === "authenticated";
  // redirect(isAuthenticated ? "/dashboard" : "/signin");
}

