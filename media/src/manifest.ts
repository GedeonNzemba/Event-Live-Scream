import { completeness, segmentsFor } from "./store.ts";
import type { Completeness, PresenceMeta, Telemetry, Track } from "./types.ts";

/**
 * Manifests.
 *
 * A JSON manifest consumed by our own player over Media Source Extensions,
 * rather than HLS. That follows directly from docs/09: we own the player, so we
 * do not need a standards-compatible playlist to make playback work — and a
 * browser capture client produces WebM chunks from MediaRecorder, which an HLS
 * playlist cannot reference without a remux step we have no reason to pay for
 * yet.
 *
 * Production adds fMP4 segments and an HLS playlist alongside this, because
 * CDNs cache HLS well and televisions speak it natively. The manifest shape
 * here is deliberately close to a playlist so that swap is mechanical.
 */

export type SegmentRef = {
  readonly seq: number;
  readonly capturedAt: number;
  readonly coversSec: number;
  readonly bytes: number;
  readonly url: string;
};

export type StatusLine = {
  readonly rung: number;
  readonly rungName: string;
  readonly batteryPct: number | null;
  readonly uplinkKbps: number;
  readonly backlogSec: number;
  /** What the viewer actually reads, in French. */
  readonly label: string;
  readonly tone: "good" | "degraded" | "buffering" | "offline";
};

export type Manifest = {
  readonly presenceId: string;
  readonly eventName: string;
  readonly state: PresenceMeta["state"];
  readonly live: boolean;
  readonly capturedThroughSec: number;
  readonly mimeType: { v: string | null; a: string | null };
  readonly segments: Readonly<Record<Track, readonly SegmentRef[]>>;
  readonly status: StatusLine;
  readonly completeness: Completeness;
  readonly generatedAtMs: number;
};

const RUNG_NAMES = [
  "720p30",
  "480p24",
  "360p20",
  "240p15",
  "180p12",
  "photo call",
  "audio only",
  "buffered",
];

/**
 * The honest status line.
 *
 * Per docs/02, telling the family *why* the picture changed is the product:
 * "power-saving mode, 90 minutes of battery left" is a service managing a known
 * constraint, while a call that dies without explanation is a failure. Same
 * physics, opposite experience. The customer's anxiety is uncertainty, not low
 * quality — so never show a bare spinner.
 */
export function statusLine(t: Telemetry | null, state: PresenceMeta["state"]): StatusLine {
  if (state === "complete" || state === "ended") {
    return {
      rung: 0,
      rungName: "—",
      batteryPct: null,
      uplinkKbps: 0,
      backlogSec: 0,
      label: state === "complete" ? "Enregistrement complet" : "Réception de la fin en cours…",
      tone: state === "complete" ? "good" : "buffering",
    };
  }

  if (!t) {
    return {
      rung: 0,
      rungName: "—",
      batteryPct: null,
      uplinkKbps: 0,
      backlogSec: 0,
      label: "En attente du correspondant…",
      tone: "buffering",
    };
  }

  const rungName = RUNG_NAMES[Math.max(0, Math.min(RUNG_NAMES.length - 1, t.rung))];
  const battery = t.batteryPct === null ? "" : ` · batterie ${Math.round(t.batteryPct)} %`;

  // The buffered rung is the one that most needs explaining: the picture has
  // stopped, and the family needs to know nothing is being lost.
  if (t.rung >= 7) {
    return {
      ...base(t, rungName),
      label: "Connexion perdue — l'enregistrement continue, vous ne perdez rien",
      tone: "offline",
    };
  }
  if (t.rung === 6) {
    return { ...base(t, rungName), label: `Réseau très faible — audio seul${battery}`, tone: "degraded" };
  }
  if (t.rung === 5) {
    return { ...base(t, rungName), label: `Réseau faible — audio et photos${battery}`, tone: "degraded" };
  }
  if (!t.screenOn && t.rung >= 3) {
    return {
      ...base(t, rungName),
      label: `Mode économie d'énergie — ${rungName}${battery}`,
      tone: "degraded",
    };
  }
  if (t.rung >= 3) {
    return { ...base(t, rungName), label: `Réseau chargé — ${rungName}${battery}`, tone: "degraded" };
  }
  return { ...base(t, rungName), label: `Bonne connexion — ${rungName}${battery}`, tone: "good" };
}

function base(t: Telemetry, rungName: string) {
  return {
    rung: t.rung,
    rungName,
    batteryPct: t.batteryPct,
    uplinkKbps: Math.round(t.uplinkKbps),
    backlogSec: Math.round(t.backlogSec),
  };
}

function refs(presenceId: string, track: Track, token: string): SegmentRef[] {
  return segmentsFor(presenceId, track).map((s) => ({
    seq: s.seq,
    capturedAt: s.capturedAt,
    coversSec: s.coversSec,
    bytes: s.bytes,
    url: `/media/${presenceId}/${track}/${s.seq}?t=${encodeURIComponent(token)}`,
  }));
}

export function buildManifest(meta: PresenceMeta, token: string): Manifest {
  return {
    presenceId: meta.id,
    eventName: meta.eventName,
    state: meta.state,
    live: meta.state === "live",
    capturedThroughSec: meta.capturedThroughSec,
    mimeType: meta.mimeType ?? { v: null, a: null },
    segments: {
      a: refs(meta.id, "a", token),
      v: refs(meta.id, "v", token),
    },
    status: statusLine(meta.telemetry, meta.state),
    completeness: completeness(meta),
    generatedAtMs: Date.now(),
  };
}
