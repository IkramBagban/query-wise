import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/users", label: "Users" },
  { href: "/cost", label: "Cost" },
  { href: "/events", label: "Events" },
  { href: "/system", label: "System" },
] as const;

export function AdminShell({
  children,
  adminClerkUserId,
}: {
  children: ReactNode;
  adminClerkUserId: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-text">
              QueryWise
            </span>
            <span className="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
              Admin
            </span>
          </div>
          <nav className="flex flex-1 items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <p
            className="hidden max-w-[12rem] truncate font-mono text-[11px] text-faint sm:block"
            title={adminClerkUserId}
          >
            {adminClerkUserId}
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
