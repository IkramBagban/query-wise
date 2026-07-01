import { SignUp } from "@clerk/nextjs";
import { AuthPageShell } from "@/components/auth";

export default function SignUpPage() {
  return (
    <AuthPageShell
      eyebrow="Create an account"
      title="Build a private analytics workspace."
      description="Connect PostgreSQL data, ask questions, and save insights to dashboards."
    >
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/chats"
      />
    </AuthPageShell>
  );
}
