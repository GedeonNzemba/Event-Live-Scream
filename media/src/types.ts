/** Shared vocabulary for the media service. */

export type Track = "a" | "v";

export const TRACKS: readonly Track[] = ["a", "v"];

export function isTrack(x: string): x is Track {
  return x === "a" || x === "v";
}

/** A segment as the server knows it, once accepted. */
export type StoredSegment = {
  readonly track: Track;
  readonly seq: number;
  /** Second of the event this segment was captured at. */
  readonly capturedAt: number;
  /** Seconds of the event it covers — 1 for continuous, more for a still. */
  readonly coversSec: number;
  readonly bytes: number;
  readonly sha256: string;
  /** Server clock when the final byte was accepted. */
  readonly receivedAtMs: number;
  /** Ladder rung the client was on when it captured this. Telemetry. */
  readonly rung: number;
};

export type PresenceState = "scheduled" | "live" | "ended" | "complete";

/** Everything the server tracks about one Presence. */
export type PresenceMeta = {
  readonly id: string;
  /** Shared secret the capture client authenticates with. Never leaves the server. */
  readonly captureKey: string;
  readonly eventName: string;
  /**
   * The exact MIME type MediaRecorder produced, e.g.
   * `video/webm;codecs=vp8,opus`. The player must hand this to MSE verbatim —
   * guessing it is how playback fails silently on one browser and works on
   * another.
   */
  mimeType: { v: string | null; a: string | null };
  state: PresenceState;
  /** Event second the client last reported capturing. */
  capturedThroughSec: number;
  /** Wall-clock ms when capture opened. */
  openedAtMs: number | null;
  endedAtMs: number | null;
  /** Last telemetry the client sent, for the honest status line. */
  telemetry: Telemetry | null;
  createdAtMs: number;
};

/** What the capture client reports alongside its uploads. */
export type Telemetry = {
  /** Current ladder rung, 0 (best) to 7 (buffered). */
  readonly rung: number;
  readonly rungName: string;
  readonly batteryPct: number | null;
  /** Estimated uplink, kbps. */
  readonly uplinkKbps: number;
  /** Seconds of captured content not yet uploaded. */
  readonly backlogSec: number;
  readonly screenOn: boolean;
  readonly atMs: number;
};

/** A gap in what the server has received. */
export type Gap = {
  readonly track: Track;
  readonly fromSec: number;
  readonly toSec: number;
};

export type Completeness = {
  /** Seconds the client says it captured. */
  readonly capturedSec: number;
  /** Seconds actually present on the server, per track. */
  readonly audioSec: number;
  readonly videoSec: number;
  /** 0..1 — the number the refund guarantee in docs/05 rests on. */
  readonly audioRatio: number;
  readonly overallRatio: number;
  readonly gaps: readonly Gap[];
};
