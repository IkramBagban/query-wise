import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SignInView } from "@/components/SignInView";

export default async function SignInPage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("qw_session")?.value === "authenticated";

  if (isAuthenticated) {
    redirect("/dashboard");
  }

  return <SignInView />;
}
