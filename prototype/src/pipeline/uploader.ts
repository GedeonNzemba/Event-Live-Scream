import type { Segment } from "../types.ts";
import type { SegmentStore } from "./store.ts";

/**
 * Priority-scheduled, resumable uploader.
 *
 * Bandwidth is allocated in strict priority order across two dimensions — live
 * versus backfill, and audio versus video:
 *
 *   1. live audio     the payload; 24 kbps gets through nearly anything
 *   2. live video     the enhancement, at whatever the ladder currently allows
 *   3. backfill audio completes the archive's soundtrack, oldest first
 *   4. backfill video completes the archive's picture, oldest first
 *
 * Backfill consumes only what the live edge leaves behind, so repairing the gap
 * from twenty minutes ago never damages the stream happening now. When the event
 * ends and live demand stops, the whole backlog drains at full speed.
 */

export type DrainResult = {
  /** Bytes acknowledged this second. */
  readonly bytes: number;
  /** True when the queue emptied and capacity was left over. */
  readonly queueLimited: boolean;
};

const PRIORITY_LIVE_AUDIO = 0;
const PRIORITY_LIVE_VIDEO = 1;
const PRIORITY_BACKFILL_AUDIO = 2;
const PRIORITY_BACKFILL_VIDEO = 3;

function priorityOf(seg: Segment, now: number, liveWindowSec: number): number {
  const isLive = now - seg.capturedAt <= liveWindowSec;
  if (seg.track === "audio") {
    return isLive ? PRIORITY_LIVE_AUDIO : PRIORITY_BACKFILL_AUDIO;
  }
  return isLive ? PRIORITY_LIVE_VIDEO : PRIORITY_BACKFILL_VIDEO;
}

export class Uploader {
  private readonly store: SegmentStore;
  private readonly liveWindowSec: number;

  constructor(store: SegmentStore, liveWindowSec: number) {
    this.store = store;
    this.liveWindowSec = liveWindowSec;
  }

  /**
   * Drain up to `capacityKbps` for one second.
   *
   * Loss is charged against goodput rather than causing content to be lost:
   * QUIC retransmits, so a lossy link is a slow link, not a lossy archive. That
   * distinction is the whole difference between this design and SRT, which
   * would correctly — and, for our purpose, fatally — discard what it cannot
   * recover inside its latency budget.
   *
   * `queueLimited` reports that everything pending was sent and spare capacity
   * remained. This distinction matters enormously to the ladder controller: a
   * throughput sample taken while queue-limited is a lower bound on the link,
   * not a measurement of it. Without that flag a controller that has dropped to
   * audio-only can never discover the network recovered, because it is no
   * longer offering enough traffic to find out.
   */
  drain(capacityKbps: number, loss: number, now: number): DrainResult {
    let budget = Math.floor(((capacityKbps * 1000) / 8) * (1 - loss));
    if (budget <= 0) return { bytes: 0, queueLimited: false };

    const queue = this.store.pending().sort((a, b) => {
      const pa = priorityOf(a, now, this.liveWindowSec);
      const pb = priorityOf(b, now, this.liveWindowSec);
      if (pa !== pb) return pa - pb;
      return a.capturedAt - b.capturedAt || a.seq - b.seq;
    });

    let sent = 0;
    for (const seg of queue) {
      if (budget <= 0) break;
      const remaining = seg.bytes - seg.bytesSent;
      const take = Math.min(remaining, budget);
      seg.bytesSent += take;
      budget -= take;
      sent += take;
      // A segment counts as delivered only when its final byte is acknowledged;
      // partial segments survive across ticks, which is what makes the upload
      // resumable across an outage.
      if (seg.bytesSent >= seg.bytes) seg.deliveredAt = now;
    }
    return { bytes: sent, queueLimited: budget > 0 };
  }
}
