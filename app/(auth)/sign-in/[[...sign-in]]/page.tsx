import { SignIn } from "@clerk/nextjs";
import { AuthPageShell } from "@/components/v2/auth";

export default function SignInPage() {
  return (
    <AuthPageShell
      eyebrow="Welcome back"
      title="Sign in to your data workspace."
      description="Continue to your private connections, conversations, and dashboards."
    >
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/workspace"
      />
    </AuthPageShell>
  );
}
