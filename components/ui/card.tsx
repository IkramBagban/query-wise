import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
}

export function Card({ children, className, hoverable = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-[0_0_0_1px_rgba(255,255,255,0.01)]",
        hoverable && "transition-all duration-150 hover:border-border-2 hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
