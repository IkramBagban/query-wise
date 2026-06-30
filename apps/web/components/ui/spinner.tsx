import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
}

const spinnerSizes = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
} as const;

export function Spinner({ className, label, size = "md" }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center justify-center text-current", spinnerSizes[size], className)}
    >
      <LoaderCircle aria-hidden="true" className="size-full animate-spin" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
