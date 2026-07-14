import type { ReactNode } from "react";

interface AuthPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: AuthPageShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-10 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:26px_26px]" />
      <section className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-xl">
          <p className="font-syne text-3xl font-bold tracking-tight text-foreground">
            Query<span className="text-primary">Wise</span>
          </p>
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-syne text-4xl font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex min-w-0 justify-center lg:min-w-[25rem]">
          {children}
        </div>
      </section>
    </main>
  );
}
