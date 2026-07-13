import { SignIn } from "@clerk/nextjs";

/**
 * Operators authenticate with the same Clerk application as the product.
 * Middleware only reaches this route when the allowlist is configured.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            QueryWise Admin
          </p>
          <h1 className="text-lg font-semibold text-foreground">Operator sign-in</h1>
        </div>
        <SignIn
          path="/sign-in"
          routing="path"
          fallbackRedirectUrl="/"
          forceRedirectUrl="/"
        />
      </div>
    </main>
  );
}
