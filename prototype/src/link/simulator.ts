import type { LinkSample } from "../types.ts";
import type { LinkProfile } from "./profiles.ts";

/** Deterministic PRNG so a given seed always reproduces the same event. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produces a per-second view of the uplink.
 *
 * Bandwidth is the product of four independent effects, which is roughly how a
 * real mobile uplink behaves: a slow random walk (the cell's changing load), a
 * congestion envelope (the event filling the cell), fast jitter (scheduling and
 * interference), and outages (scheduled blackouts plus random brief dropouts).
 */
export class LinkSimulator {
  private readonly profile: LinkProfile;
  private readonly durationSec: number;
  private readonly rand: () => number;
  private drift = 0;
  private microOutageRemaining = 0;

  constructor(profile: LinkProfile, durationSec: number, seed: number) {
    this.profile = profile;
    this.durationSec = durationSec;
    this.rand = mulberry32(seed);
  }

  /** True when a scheduled blackout covers this second. */
  private inScheduledOutage(t: number): boolean {
    return this.profile.outages.some(
      (o) => t >= o.startSec && t < o.startSec + o.durationSec,
    );
  }

  sample(t: number): LinkSample {
    const p = this.profile;

    // Slow random walk, bounded, representing the cell's changing background load.
    this.drift += (this.rand() - 0.5) * p.driftKbps * 0.08;
    this.drift = Math.max(-p.driftKbps, Math.min(p.driftKbps, this.drift));

    if (this.inScheduledOutage(t)) {
      return { kbps: 0, loss: 1, rttMs: p.rttMs * 4, signal: 0.05 };
    }

    // Brief unscheduled dropouts, 2-9 seconds each.
    if (this.microOutageRemaining > 0) {
      this.microOutageRemaining -= 1;
      return { kbps: 0, loss: 1, rttMs: p.rttMs * 3, signal: p.signal * 0.3 };
    }
    if (this.rand() < p.microOutagesPerHour / 3600) {
      this.microOutageRemaining = 2 + Math.floor(this.rand() * 8);
      return { kbps: 0, loss: 1, rttMs: p.rttMs * 3, signal: p.signal * 0.3 };
    }

    const progress = this.durationSec > 0 ? t / this.durationSec : 0;
    const congestion = p.congestion ? p.congestion(progress) : 1;

    const jitterFactor = 1 + (this.rand() - 0.5) * 2 * p.jitter;
    const kbps = Math.max(0, (p.baseKbps + this.drift) * congestion * jitterFactor);

    // Loss and signal quality both worsen as available bandwidth falls; a
    // starved cell is also a noisy one.
    //
    // This models *radio-layer* loss only — bit errors and retransmissions on
    // the air interface. Congestion loss is deliberately not modelled here,
    // because congestion is already represented by the capacity limit itself:
    // the uploader simply cannot send more than `kbps`. Adding congestion loss
    // on top would double-count it, and would punish the client for a backlog
    // the ladder is already responding to.
    const scarcity = 1 - Math.min(1, kbps / Math.max(1, p.baseKbps));
    const loss = Math.min(0.15, p.baseLoss + scarcity * scarcity * 0.06);
    const signal = Math.max(0.05, p.signal * (1 - scarcity * 0.6));

    return {
      kbps,
      loss,
      rttMs: p.rttMs * (1 + scarcity * 2),
      signal,
    };
  }
}
