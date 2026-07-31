import type { Segment, Track } from "../types.ts";

/**
 * The durable segment store: the single most important object in the system.
 *
 * Every second of capture lands here before any network operation is attempted.
 * The network is then a separate, opportunistic consumer of this queue. That
 * inversion is what converts the worst outcome — the moment is gone forever —
 * into a merely imperfect one: everything arrives, some of it late.
 *
 * On a real device this is an append-only file plus an fsync'd JSONL manifest,
 * so a crash or a flat battery loses at most the current second.
 */
export class SegmentStore {
  private readonly segments: Segment[] = [];
  private nextSeq = 1;

  /** Records a captured second. Zero-byte writes (a rung with no video this second) are skipped. */
  append(track: Track, capturedAt: number, bytes: number, coversSec = 1): Segment | null {
    if (bytes <= 0) return null;
    const seg: Segment = {
      seq: this.nextSeq++,
      track,
      capturedAt,
      bytes,
      coversSec,
      bytesSent: 0,
      deliveredAt: null,
    };
    this.segments.push(seg);
    return seg;
  }

  get all(): readonly Segment[] {
    return this.segments;
  }

  pending(): Segment[] {
    return this.segments.filter((s) => s.deliveredAt === null);
  }

  /** Bytes captured but not yet acknowledged by the server. */
  backlogBytes(): number {
    let n = 0;
    for (const s of this.segments) {
      if (s.deliveredAt === null) n += s.bytes - s.bytesSent;
    }
    return n;
  }

  /**
   * Seconds of *live* content waiting to be sent — the signal the ladder
   * controller reacts to. Backfill is excluded deliberately: an hour of
   * historical backlog draining in the background is not a reason to degrade
   * the picture happening right now.
   */
  liveQueueDepthSec(now: number, liveWindowSec: number): number {
    let oldest: number | null = null;
    for (const s of this.segments) {
      if (s.deliveredAt !== null) continue;
      if (now - s.capturedAt > liveWindowSec) continue;
      if (oldest === null || s.capturedAt < oldest) oldest = s.capturedAt;
    }
    return oldest === null ? 0 : now - oldest;
  }

  capturedCount(track: Track): number {
    return this.segments.filter((s) => s.track === track).length;
  }

  deliveredCount(track: Track): number {
    return this.segments.filter((s) => s.track === track && s.deliveredAt !== null).length;
  }

  capturedBytes(): number {
    return this.segments.reduce((n, s) => n + s.bytes, 0);
  }

  /**
   * Fraction of captured segments that reached the server, 0..1.
   * This is the number the refund guarantee in docs/05-operations.md rests on.
   */
  completeness(track?: Track): number {
    const pool = track ? this.segments.filter((s) => s.track === track) : this.segments;
    if (pool.length === 0) return 1;
    return pool.filter((s) => s.deliveredAt !== null).length / pool.length;
  }

  /**
   * Fraction of the *event* that reached the viewer inside the live latency
   * window — what someone watching in real time actually experienced.
   *
   * Measured against event duration rather than against captured segments,
   * deliberately. Dividing by what we chose to capture would flatter the
   * result: an hour spent at the audio-only rung captures no video, so a
   * captured-segment denominator would score video presence as perfect while
   * the viewer stared at a still image.
   */
  livePresence(track: Track, liveWindowSec: number, durationSec: number): number {
    if (durationSec <= 0) return 0;
    // Distinct seconds, not summed coverage. A still covers the four seconds it
    // holds the screen, but if the ladder climbs back to continuous video part
    // way through, those seconds must not be counted twice.
    const covered = new Uint8Array(durationSec);
    for (const s of this.segments) {
      if (s.track !== track) continue;
      if (s.deliveredAt === null) continue;
      if (s.deliveredAt - s.capturedAt > liveWindowSec) continue;
      const end = Math.min(durationSec, s.capturedAt + s.coversSec);
      for (let i = Math.max(0, s.capturedAt); i < end; i++) covered[i] = 1;
    }
    let n = 0;
    for (const v of covered) n += v;
    return n / durationSec;
  }
}
