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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_0%_0%,rgba(46,213,46,0.22),transparent_30%),radial-gradient(circle_at_100%_0%,rgba(46,213,46,0.14),transparent_26%),#f4faf2] px-5 py-10 text-[#09110a]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(23,65,40,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(23,65,40,0.2)_1px,transparent_1px)] [background-size:26px_26px]" />
      <section className="relative z-10 grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="max-w-xl">
          <p className="font-syne text-3xl font-bold tracking-tight text-white">
            Query<span className="text-[#2ed52e]">Wise</span>
          </p>
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.16em] text-[#2f7a3f]">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-syne text-4xl font-bold leading-tight tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[#2f4938]">
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
