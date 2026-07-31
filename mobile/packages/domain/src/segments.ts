import type { Rung } from "./ladder.ts";

/**
 * Upload priority.
 *
 * Bandwidth is allocated in strict priority order across two dimensions — live
 * versus backfill, audio versus video:
 *
 *   0. live audio      the payload; 24 kbps gets through nearly anything
 *   1. live video      the enhancement, at whatever the ladder currently allows
 *   2. backfill audio  completes the archive's soundtrack, oldest first
 *   3. backfill video  completes the archive's picture, oldest first
 *
 * Backfill consumes only what the live edge leaves behind, so repairing a gap
 * from twenty minutes ago never damages the stream happening now.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT. The browser client gated *all* video on
 * the current rung. At the buffered rung it therefore stopped sending backfill
 * video too — so the queue that caused the downgrade could never drain, and the
 * client stayed offline for the rest of the event. The rung is a statement
 * about what to *capture and send live*. It says nothing about content that is
 * already old, already encoded, already on disk and merely waiting for a turn.
 * `eligible()` below encodes that distinction, and `test/domain.test.ts` holds
 * it in place.
 */

export type Track = "a" | "v";

export type PendingSegment = {
  readonly seq: number;
  readonly track: Track;
  /** Seconds since capture start of the first frame in this segment. */
  readonly capturedAt: number;
  readonly bytes: number;
  /** The rung in force when this was encoded — travels to the server. */
  readonly rung: number;
};

export const PRIORITY = {
  liveAudio: 0,
  liveVideo: 1,
  backfillAudio: 2,
  backfillVideo: 3,
} as const;

export function isLive(seg: PendingSegment, nowSec: number, liveWindowSec: number): boolean {
  return nowSec - seg.capturedAt <= liveWindowSec;
}

export function priorityOf(seg: PendingSegment, nowSec: number, liveWindowSec: number): number {
  const live = isLive(seg, nowSec, liveWindowSec);
  if (seg.track === "a") return live ? PRIORITY.liveAudio : PRIORITY.backfillAudio;
  return live ? PRIORITY.liveVideo : PRIORITY.backfillVideo;
}

/**
 * May this segment be sent right now?
 *
 * Exactly one thing is ever withheld: **live video at a rung that has no
 * video**. Audio always flows, and backfill always flows.
 *
 * THE BUFFERED RUNG IS NOT AN EXEMPTION, and this is the subtle part. The
 * obvious rule — "we think the link is down, so send nothing" — deadlocks:
 * the only way to discover the link came back is to try sending, so a client
 * that stops trying stays offline for the rest of the event no matter what the
 * network does. The engine's simulation reproduced exactly that within an hour
 * of this function being written the obvious way.
 *
 * What the buffered rung *does* change is volume, not permission: the engine
 * throttles to a single probe per tick while it believes it is offline. That
 * belongs in the engine, where there is a clock, and not here.
 */
export function eligible(
  seg: PendingSegment,
  nowSec: number,
  liveWindowSec: number,
  rung: Rung,
): boolean {
  if (seg.track === "a") return true;
  if (!isLive(seg, nowSec, liveWindowSec)) return true; // backfill video: always
  return rung.hasVideo;
}

/**
 * Age of the oldest unsent segment *inside the live window*.
 *
 * Lesson 2 from the controller, in one function. Measuring across all pending
 * content reports a backlog that is old by definition after an outage, which
 * pins the ladder at the buffered rung forever.
 */
export function liveBacklogSec(
  pending: readonly PendingSegment[],
  nowSec: number,
  liveWindowSec: number,
): number {
  let oldest = nowSec;
  for (const seg of pending) {
    if (!isLive(seg, nowSec, liveWindowSec)) continue;
    if (seg.capturedAt < oldest) oldest = seg.capturedAt;
  }
  return Math.max(0, nowSec - oldest);
}

/**
 * The send order for this instant.
 *
 * Returns a new array; the caller's queue is not mutated. Ties break on capture
 * time then sequence, so a track never reorders itself — the player appends in
 * sequence order and a hole stalls it.
 */
export function sendOrder(
  pending: readonly PendingSegment[],
  nowSec: number,
  liveWindowSec: number,
  rung: Rung,
): PendingSegment[] {
  return pending
    .filter((s) => eligible(s, nowSec, liveWindowSec, rung))
    .sort((a, b) => {
      const pa = priorityOf(a, nowSec, liveWindowSec);
      const pb = priorityOf(b, nowSec, liveWindowSec);
      if (pa !== pb) return pa - pb;
      if (a.capturedAt !== b.capturedAt) return a.capturedAt - b.capturedAt;
      return a.seq - b.seq;
    });
}

/**
 * What the server has not got, given what it says it has.
 *
 * The reconciliation half of the protocol: after an outage the client asks
 * `/ingest/:id/status`, is told which sequence numbers arrived, and re-sends
 * only the difference. Without this the client either re-uploads the whole
 * event — wasting a data bundle somebody paid cash for — or assumes success and
 * silently loses the part that failed.
 */
export function missing(
  local: readonly PendingSegment[],
  received: Readonly<Record<Track, readonly number[]>>,
): PendingSegment[] {
  const have: Record<Track, Set<number>> = {
    a: new Set(received.a ?? []),
    v: new Set(received.v ?? []),
  };
  return local.filter((s) => !have[s.track].has(s.seq));
}

/** Bytes still owed to the server, for the correspondent's "reste à envoyer". */
export function pendingBytes(pending: readonly PendingSegment[]): number {
  let total = 0;
  for (const s of pending) total += s.bytes;
  return total;
}
