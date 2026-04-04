import { redirect } from "next/navigation";

export default async function SignInPage() {
  // Auth disabled - redirect to dashboard
  redirect("/dashboard");
  
  // Auth enabled version (commented out):
  // const cookieStore = await cookies();
  // const isAuthenticated = cookieStore.get("qw_session")?.value === "authenticated";
  // if (isAuthenticated) {
  //   redirect("/dashboard");
  // }
  // return <SignInView />;
}
