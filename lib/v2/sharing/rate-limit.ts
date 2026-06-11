import "server-only";

import { AppError } from "@/lib/v2/dal/core";

// Initial single-process limiter. Keep this interface stable when replacing the
// backing Map with a distributed, atomic rate-limit store.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_ENTRIES = 5_000;
const attempts = new Map<string, { count: number; resetsAt: number }>();

function prune(now: number): void {
  for (const [key, entry] of attempts) {
    if (entry.resetsAt <= now) attempts.delete(key);
    if (attempts.size <= MAX_ENTRIES) break;
  }
}

export function consumePasswordAttempt(key: string, now = Date.now()): void {
  prune(now);
  const current = attempts.get(key);
  if (current && current.resetsAt > now && current.count >= MAX_ATTEMPTS) {
    throw new AppError("RATE_LIMITED", "Too many password attempts. Try again later.", true);
  }
  attempts.set(key, {
    count: current && current.resetsAt > now ? current.count + 1 : 1,
    resetsAt: current && current.resetsAt > now ? current.resetsAt : now + WINDOW_MS,
  });
}

export function clearPasswordAttempts(key: string): void {
  attempts.delete(key);
}

