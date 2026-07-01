import "server-only";
import { devLog } from "@query-wise/shared/observability";

const activeRuns = new Map<string, AbortController>();

export function registerActiveQueryRun(queryRunId: string): AbortSignal {
  const controller = new AbortController();
  activeRuns.set(queryRunId, controller);
  return controller.signal;
}

export function unregisterActiveQueryRun(queryRunId: string): void {
  activeRuns.delete(queryRunId);
}

export function abortActiveQueryRun(queryRunId: string): void {
  activeRuns.get(queryRunId)?.abort();
}

export function throwIfQueryRunAborted(signal: AbortSignal): void {
  devLog("info", "query.run.check-abort", "Checking if query run was aborted.", { aborted: signal.aborted });
  if (signal.aborted) {
    throw new DOMException("The query run was cancelled.", "AbortError");
  }
}
