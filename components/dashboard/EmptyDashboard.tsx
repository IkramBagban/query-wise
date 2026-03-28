import { Card } from "@/components/ui/card";

export function EmptyDashboard() {
  return (
    <Card className="mx-auto mt-14 max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 h-20 w-20 rounded-full border border-border bg-surface-2" />
      <h2 className="font-syne text-2xl text-text-1">No widgets yet</h2>
      <p className="mt-2 text-sm text-text-2">Go to workspace, ask a question, then save the result as a widget.</p>
    </Card>
  );
}
