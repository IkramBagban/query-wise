"use client";

import { ErrorState } from "@/components/v2/ResourceState";

export default function ErrorPage({ error, unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <div className="p-4 sm:p-6"><ErrorState error={error} onRetry={unstable_retry} /></div>;
}
