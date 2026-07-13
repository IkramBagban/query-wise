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
          "group flex w-full items-center gap-2 rounded-xl p-2 text-left text-sm transition hover:bg-surface-2",
          iconOnly && "justify-center p-0",
        )}
      >
        <div className="relative flex shrink-0 items-center justify-center">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full bg-text font-syne text-xs font-semibold text-bg",
              iconOnly && "size-10",
            )}
          >
            {initials}
          </span>
          {data?.plan.id === "pro" && (
            <span className="absolute -right-2 -top-1.5 flex h-4 items-center justify-center rounded-full border-2 border-surface bg-green-600 px-1 text-[8px] font-bold tracking-wider text-white">
              PRO
            </span>
          )}
        </div>

        {!iconOnly ? (
          <>
            <span className="flex min-w-0 flex-1 items-center px-1">
              <span className="truncate font-medium text-foreground">
                {isLoaded ? name : "Account"}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50 transition-transform group-data-open:rotate-180" />
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
