import { cn } from "@/lib/utils";

const variantClasses = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/20 text-warning",
  danger: "bg-danger/20 text-danger",
  info: "bg-[#2ed52e] text-white",
  neutral: "bg-surface-3 text-text-2",
} as const;

interface BadgeProps {
  variant?: keyof typeof variantClasses;
  children: React.ReactNode;
  showDot?: boolean;
}

export function Badge({ variant = "neutral", children, showDot = true }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        variantClasses[variant],
      )}
    >
      {showDot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
