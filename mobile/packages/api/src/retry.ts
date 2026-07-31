/**
 * Retry policy.
 *
 * This is the file that decides whether a wedding survives a bad cell, so the
 * rules are stated rather than assumed:
 *
 *   RETRY FOREVER, NOT N TIMES. A correspondent's uplink can be gone for twenty
 *   minutes. A client that gives up after five attempts has thrown away content
 *   it already holds on disk for no reason — the bytes are safe, only the
 *   sending failed. Attempts are therefore unbounded by default and the backoff
 *   is capped, so a dead link costs one request per capped interval rather than
 *   a tight loop.
 *
 *   A 4xx IS AN ANSWER. The server understood and refused. Retrying a 401 with
 *   the same bad key produces the same 401 for three hours while the real
 *   problem — a mistyped capture key — goes unreported. The two exceptions are
 *   408 and 429, which mean "not now" rather than "no".
 *
 *   JITTER IS NOT DECORATION. When a village cell recovers, every phone on it
 *   retries at once. Full jitter spreads the reconnect instead of synchronising
 *   it into a second outage.
 */

export type RetryPolicy = {
  readonly baseMs: number;
  readonly capMs: number;
  /** Unbounded by default; a finite value is for tests and one-shot calls. */
  readonly maxAttempts: number;
  /** Injected so tests are deterministic. */
  readonly random: () => number;
};

export const DEFAULT_RETRY: RetryPolicy = {
  baseMs: 500,
  capMs: 30_000,
  maxAttempts: Number.POSITIVE_INFINITY,
  random: Math.random,
};

/** Exponential backoff with full jitter, capped. `attempt` is 0-based. */
export function backoffMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY): number {
  const exponential = Math.min(policy.capMs, policy.baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(policy.random() * exponential);
}

/** Is this HTTP status worth trying again? */
export function retriableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true; // "not now"
  if (status >= 500) return true; // the server's problem, not ours
  return false;
}

export type FailureKind =
  /** No response at all: aeroplane mode, no cell, DNS gone. */
  | "network"
  /** The server answered and refused. Stop and report. */
  | "rejected"
  /** The server answered and asked for a retry. */
  | "transient";

export function classify(status: number | null): FailureKind {
  if (status === null) return "network";
  return retriableStatus(status) ? "transient" : "rejected";
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly kind: FailureKind;
  readonly attempts: number;

  constructor(message: string, status: number | null, attempts: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = classify(status);
    this.attempts = attempts;
  }

  /** True when retrying could plausibly work. */
  get retriable(): boolean {
    return this.kind !== "rejected";
  }
}
