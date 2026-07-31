/**
 * Shared vocabulary for the presence engine.
 *
 * The whole simulation runs on a one-second tick, which matches the CMAF chunk
 * duration in docs/06-technical-architecture.md. One tick produces at most one
 * audio segment and one video segment.
 */

export type Track = "audio" | "video";

/** One rung of the degradation ladder. */
export type Rung = {
  readonly index: number;
  readonly name: string;
  /** Total target bitrate, kbps, audio + video. */
  readonly totalKbps: number;
  readonly videoKbps: number;
  readonly audioKbps: number;
  readonly height: number;
  readonly fps: number;
  /** Rung 4 sends a still every N seconds instead of continuous video. */
  readonly stillIntervalSec: number | null;
  readonly hasVideo: boolean;
};

/** A captured chunk, durably stored before any network operation is attempted. */
export type Segment = {
  readonly seq: number;
  readonly track: Track;
  /** Second of the event at which this was captured. */
  readonly capturedAt: number;
  readonly bytes: number;
  /**
   * Seconds of the event this segment covers for the viewer. One for audio and
   * continuous video; at the photo-call rung a single still holds the screen
   * for its whole interval, which is exactly why that rung feels like presence
   * rather than like a stall.
   */
  readonly coversSec: number;
  /** Bytes already accepted by the server; enables resumable upload. */
  bytesSent: number;
  /** Event second at which the server acknowledged the final byte. */
  deliveredAt: number | null;
};

/** Instantaneous state of the uplink, produced by the link simulator. */
export type LinkSample = {
  /** Usable uplink throughput this second, kbps. Zero means a total outage. */
  readonly kbps: number;
  /** Packet loss ratio, 0..1. */
  readonly loss: number;
  readonly rttMs: number;
  /** Radio signal quality, 0..1. Drives transmit power in the battery model. */
  readonly signal: number;
};

export type PowerState = {
  /** Remaining energy, watt-hours. */
  wh: number;
  readonly capacityWh: number;
  screenOn: boolean;
};

/** Per-second record of what the engine did and what the viewer experienced. */
export type TickRecord = {
  readonly t: number;
  readonly rung: number;
  readonly linkKbps: number;
  readonly deliveredKbps: number;
  readonly queueDepthSec: number;
  readonly batteryPct: number;
  readonly audioLive: boolean;
  readonly videoLive: boolean;
  /** The controller's belief about available capacity, kbps. */
  readonly estimateKbps: number;
  /** Lowest-quality rung the power budget permitted this second. */
  readonly powerCap: number;
};

export type SessionConfig = {
  readonly name: string;
  readonly durationSec: number;
  /** Seconds of post-event drain allowed for backfill to finish uploading. */
  readonly drainSec: number;
  readonly batteryStartPct: number;
  readonly batteryCapacityWh: number;
  /**
   * Usable energy from the correspondent's power bank, watt-hours. This is the
   * €18 line item in the kit described in docs/05-operations.md, and modelling
   * it is how we check that €18 actually buys what we claim it does.
   */
  readonly powerBankWh?: number;
  /**
   * Seconds of tolerance before a viewer counts content as missing from the
   * live stream. Watch mode buys resilience by spending latency; see doc 06.
   */
  readonly liveWindowSec: number;
  readonly seed: number;
};
