import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
}

export function Spinner({ className }: SpinnerProps) {
  return <span className={cn("inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-2 border-t-accent", className)} />;
}
