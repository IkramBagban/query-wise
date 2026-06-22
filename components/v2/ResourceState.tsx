import { AlertTriangle, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-32 items-center justify-center gap-2 text-sm text-text-3">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border-2 bg-surface p-8 text-center">
      <Inbox className="h-7 w-7 text-accent-2" />
      <h2 className="mt-3 font-syne text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-text-3">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Unable to load this view",
  error,
  onRetry,
}: {
  title?: string;
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-danger/25 bg-danger/5 p-8 text-center">
      <AlertTriangle className="h-7 w-7 text-danger" />
      <h2 className="mt-3 font-syne text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-lg text-sm text-text-3">{error.message}</p>
      {onRetry ? <Button className="mt-4" variant="ghost" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
