"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Overview", icon: "svg-overview" },
  { href: "/users", label: "Users", icon: "svg-users" },
  { href: "/cost", label: "Cost", icon: "svg-cost" },
  { href: "/events", label: "Events", icon: "svg-events" },
  { href: "/system", label: "System", icon: "svg-system" },
] as const;

export function AdminShell({
  children,
  adminClerkUserId,
}: {
  children: ReactNode;
  adminClerkUserId: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40 md:flex-row">
      {/* Sidebar */}
      <aside className="sticky top-0 z-30 flex h-screen w-full flex-col border-r bg-background md:w-64">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="">QueryWise</span>
            <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
              Admin
            </span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            {NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                    isActive
                      ? "bg-muted text-primary"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t p-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-muted">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold uppercase text-primary">
              {adminClerkUserId.substring(5, 7)}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-foreground">
                Admin User
              </span>
              <span className="truncate text-xs" title={adminClerkUserId}>
                {adminClerkUserId}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col overflow-auto p-4 lg:p-8">
        <div className="mx-auto w-full max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
