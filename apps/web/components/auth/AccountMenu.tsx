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
          "group flex w-full items-center gap-2 rounded-full border border-border bg-background px-1.5 py-1.5 text-left text-sm transition hover:border-border hover:bg-accent hover:text-accent-foreground",
          iconOnly && "h-10 w-10 justify-center p-0",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-syne text-xs font-semibold text-primary",
            iconOnly && "size-10",
          )}
        >
          {initials}
        </span>

        {!iconOnly ? (
          <>
            <span className="flex shrink-0 items-center gap-2 pr-2 pl-1">
              {data ? (
                <span className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  {data.plan.displayName} · {data.remaining.questionsThisMonth} left
                </span>
              ) : null}
            </span>
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        side={iconOnly ? "right" : "top"}
        sideOffset={8}
        className="w-72"
      >
        <div className="flex items-center gap-3 p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-syne text-sm font-semibold text-primary">
            {initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-foreground">{isLoaded ? name : "Account"}</span>
            <span className="truncate text-xs text-muted-foreground">{isLoaded ? email : "Loading profile"}</span>
          </div>
        </div>

        {data ? (
          <div className="px-3 pb-3">
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                {data.plan.displayName}
              </span>
              <span className="font-medium text-foreground">{data.remaining.questionsThisMonth} left</span>
            </div>
          </div>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/plan")} className="cursor-pointer">
            <Gauge className="mr-2 size-4" />
            Plan &amp; usage
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer">
            <UserCircle2 className="mr-2 size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings")} className="cursor-pointer">
            <Settings2 className="mr-2 size-4" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => { void signOut({ redirectUrl: "/sign-in" }); }} className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
