import { Card } from "@/components/ui/card";

interface SchemaSummaryProps {
  summary: string;
}

export function SchemaSummary({ summary }: SchemaSummaryProps) {
  return (
    <Card className="max-h-60 overflow-auto p-3">
      <p className="text-xs leading-6 text-text-2">{summary || "Summary unavailable."}</p>
    </Card>
  );
}
