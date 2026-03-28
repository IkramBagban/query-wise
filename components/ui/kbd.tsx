import { cn } from "@/lib/utils";

interface KbdProps {
  className?: string;
  children: React.ReactNode;
}

export function Kbd({ className, children }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded border border-border-2 bg-surface-2 px-1.5 text-[11px] font-medium text-text-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
