/**
 * The wire types, mirroring `media/src/manifest.ts` and `media/src/server.ts`.
 *
 * Kept as hand-written types rather than generated ones because the server is
 * twelve hundred lines of Node with no schema tooling, and a generator would be
 * more machinery than the surface justifies. The e2e test in `media/test` is
 * what actually keeps these honest.
 */

export type Track = "a" | "v";

export type PresenceState = "created" | "live" | "ended" | "complete";

export type SegmentRef = {
  readonly seq: number;
  readonly capturedAt: number;
  readonly coversSec: number;
  readonly bytes: number;
  /** The ladder rung in force when this was captured — drives the timeline. */
  readonly rung: number;
  readonly url: string;
};

export type StatusLine = {
  readonly rung: number;
  readonly rungName: string;
  readonly batteryPct: number | null;
  readonly uplinkKbps: number;
  readonly backlogSec: number;
  readonly label: string;
  readonly tone: "good" | "degraded" | "buffering" | "offline";
};

export type Completeness = {
  readonly heardRatio: number;
  readonly sawRatio: number;
  readonly overallRatio: number;
};

export type Manifest = {
  readonly presenceId: string;
  readonly eventName: string;
  readonly state: PresenceState;
  readonly live: boolean;
  readonly capturedThroughSec: number;
  readonly mimeType: { readonly v: string | null; readonly a: string | null };
  readonly segments: Readonly<Record<Track, readonly SegmentRef[]>>;
  readonly status: StatusLine;
  readonly completeness: Completeness;
  readonly generatedAtMs: number;
};

export type IngestStatus = {
  readonly state: PresenceState;
  readonly capturedThroughSec: number;
  /** What actually arrived. The client re-sends only the difference. */
  readonly received: Readonly<Record<Track, readonly number[]>>;
  readonly completeness: Completeness;
};

export type Telemetry = {
  readonly rung: number;
  readonly rungName: string;
  readonly batteryPct: number | null;
  readonly uplinkKbps: number;
  readonly backlogSec: number;
  readonly screenOn: boolean;
};

/** What `PUT /ingest/:id/:track/:seq` reports back. */
export type PutOutcome = "stored" | "duplicate";
