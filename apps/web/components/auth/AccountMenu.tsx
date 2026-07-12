"use client";

import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  ChevronDown,
  Gauge,
  LogOut,
  Settings2,
  UserCircle2,
} from "lucide-react";

import { usePlanUsage } from "@/lib/plans/use-plan-usage";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getInitials(name?: string | null, fallback = "U") {
  const trimmed = name?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || fallback;
}

export function AccountMenu({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const { data } = usePlanUsage();

  const name = user?.fullName ?? user?.username ?? "Account";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Manage your profile";
  const initials = getInitials(user?.fullName ?? user?.username, "A");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        title="Open account menu"
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm transition hover:border-accent-line hover:bg-surface-2",
          iconOnly && "h-9 w-9 justify-center border-transparent bg-transparent p-0 hover:border-border hover:bg-surface-2",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-syne text-xs font-semibold text-accent-strong",
            iconOnly && "size-9 rounded-lg",
          )}
        >
          {initials}
        </span>

        {!iconOnly ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-text">{isLoaded ? name : "Account"}</span>
              <span className="block truncate text-xs text-faint">{isLoaded ? email : "Loading profile"}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {data ? (
                <span className="rounded-full bg-surface-2 px-2 py-1 font-mono text-[10px] text-faint">
                  {data.plan.displayName} · {data.remaining.questionsThisMonth} left
                </span>
              ) : null}
              <ChevronDown className="size-4 text-faint transition group-data-[state=open]:rotate-180" />
            </span>
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side={iconOnly ? "right" : "top"}
        sideOffset={8}
        className="w-72 p-2"
      >
        <div className="px-1 pb-1">
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-syne text-sm font-semibold text-accent-strong">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text">{isLoaded ? name : "Account"}</span>
                <span className="block truncate text-xs text-faint">{isLoaded ? email : "Loading profile"}</span>
              </span>
            </div>
            {data ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                <span className="rounded-full bg-bg px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
                  {data.plan.displayName}
                </span>
                <span>{data.remaining.questionsThisMonth} questions left</span>
              </div>
            ) : null}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/plan")}>
            <Gauge className="size-4" />
            Plan &amp; usage
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/profile")}>
            <UserCircle2 className="size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings2 className="size-4" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => { void signOut({ redirectUrl: "/sign-in" }); }}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
