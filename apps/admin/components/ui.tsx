import { ReactNode } from "react";
import { Card as ShadcnCard, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge as ShadcnBadge } from "@/components/ui/badge";

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <ShadcnCard className={className}>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </ShadcnCard>
  );
}

export function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <ShadcnCard>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-semibold uppercase tracking-wider">
          {label}
        </CardDescription>
        <CardTitle className="text-3xl tabular-nums tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground font-medium">{hint}</p>
        </CardContent>
      )}
    </ShadcnCard>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn" | "danger";
}) {
  const variants = {
    neutral: "secondary",
    accent: "default",
    warn: "destructive",
    danger: "destructive",
  } as const;
  return (
    <ShadcnBadge variant={variants[tone] || "secondary"} className={tone === "warn" ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-amber-500/20" : ""}>
      {children}
    </ShadcnBadge>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h} className="text-xs uppercase tracking-wider">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in-50">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
      {children}
    </code>
  );
}

export function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex justify-between gap-2 text-xs font-medium">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
