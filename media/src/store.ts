import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { newCaptureKey } from "./tokens.ts";
import type { Completeness, Gap, PresenceMeta, StoredSegment, Telemetry, Track } from "./types.ts";
import { TRACKS } from "./types.ts";

/**
 * Server-side segment storage.
 *
 * Mirrors the client's durable store from docs/06: content lands here and is
 * never overwritten, arrival order is irrelevant, and the same segment may be
 * offered many times without harm. That last property is what makes the
 * client's retry-after-ambiguous-failure safe — and ambiguous failures are the
 * normal case on a Congolese uplink, not the exception.
 *
 * Files on disk, because this has to be runnable with no setup. Object storage
 * behind the same interface is the production answer (docs/10).
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ELONGO_MEDIA_DIR ?? join(here, "..", ".media");

function presenceDir(id: string): string {
  return join(ROOT, id);
}

function segmentPath(id: string, track: Track, seq: number): string {
  return join(presenceDir(id), track, `${String(seq).padStart(6, "0")}.seg`);
}

function metaPath(id: string): string {
  return join(presenceDir(id), "meta.json");
}

function indexPath(id: string): string {
  return join(presenceDir(id), "index.jsonl");
}

/** Rejects anything that could escape the media directory. */
export function isValidPresenceId(id: string): boolean {
  return /^[A-Za-z0-9_-]{4,64}$/.test(id);
}

function assertId(id: string): void {
  if (!isValidPresenceId(id)) throw new Error(`invalid presence id: ${id}`);
}

// ------------------------------------------------------------------ meta ---

export function createPresence(id: string, eventName: string): PresenceMeta {
  assertId(id);
  const dir = presenceDir(id);
  for (const t of TRACKS) mkdirSync(join(dir, t), { recursive: true });

  const meta: PresenceMeta = {
    id,
    captureKey: newCaptureKey(),
    eventName,
    mimeType: { v: null, a: null },
    state: "scheduled",
    capturedThroughSec: 0,
    openedAtMs: null,
    endedAtMs: null,
    telemetry: null,
    createdAtMs: Date.now(),
  };
  saveMeta(meta);
  return meta;
}

export function getMeta(id: string): PresenceMeta | null {
  if (!isValidPresenceId(id)) return null;
  try {
    return JSON.parse(readFileSync(metaPath(id), "utf8")) as PresenceMeta;
  } catch {
    return null;
  }
}

export function saveMeta(meta: PresenceMeta): void {
  assertId(meta.id);
  mkdirSync(presenceDir(meta.id), { recursive: true });
  const tmp = `${metaPath(meta.id)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2));
  renameSync(tmp, metaPath(meta.id));
}

export function listPresences(): PresenceMeta[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT)
    .map((id) => getMeta(id))
    .filter((m): m is PresenceMeta => m !== null)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

// -------------------------------------------------------------- segments ---

export type PutResult =
  | { readonly status: "stored"; readonly segment: StoredSegment }
  | { readonly status: "duplicate"; readonly segment: StoredSegment }
  | { readonly status: "conflict"; readonly reason: string }
  | { readonly status: "corrupt"; readonly reason: string };

export type PutInput = {
  readonly presenceId: string;
  readonly track: Track;
  readonly seq: number;
  readonly capturedAt: number;
  readonly coversSec: number;
  readonly rung: number;
  readonly declaredSha256: string | null;
  readonly body: Buffer;
};

export function putSegment(input: PutInput): PutResult {
  const { presenceId, track, seq, body, declaredSha256 } = input;
  assertId(presenceId);

  const sha256 = createHash("sha256").update(body).digest("hex");

  // The client hashes before sending. A mismatch means the bytes were mangled
  // in transit, and accepting them would silently corrupt the family's archive
  // in a way nobody discovers until they watch it.
  if (declaredSha256 && declaredSha256 !== sha256) {
    return { status: "corrupt", reason: "sha256 mismatch — bytes were altered in transit" };
  }

  const existing = getSegment(presenceId, track, seq);
  if (existing) {
    // Same bytes offered again: the normal outcome of a retry after an
    // ambiguous failure. Say so and move on.
    if (existing.sha256 === sha256) return { status: "duplicate", segment: existing };
    return {
      status: "conflict",
      reason: `sequence ${seq} already holds different content`,
    };
  }

  const segment: StoredSegment = {
    track,
    seq,
    capturedAt: input.capturedAt,
    coversSec: Math.max(1, input.coversSec),
    bytes: body.length,
    sha256,
    receivedAtMs: Date.now(),
    rung: input.rung,
  };

  const path = segmentPath(presenceId, track, seq);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);

  // Append-only receipt log: the index can always be rebuilt from it, and it
  // records arrival order, which the on-disk files do not.
  appendFileSync(indexPath(presenceId), `${JSON.stringify(segment)}\n`);

  return { status: "stored", segment };
}

let indexCache = new Map<string, StoredSegment[]>();

function receipts(presenceId: string): StoredSegment[] {
  const cached = indexCache.get(presenceId);
  if (cached) return cached;
  let list: StoredSegment[] = [];
  try {
    list = readFileSync(indexPath(presenceId), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredSegment);
  } catch {
    list = [];
  }
  indexCache.set(presenceId, list);
  return list;
}

/** Call after any write; the receipt log is append-only so re-reading is cheap. */
function invalidate(presenceId: string): void {
  indexCache.delete(presenceId);
}

export function getSegment(presenceId: string, track: Track, seq: number): StoredSegment | null {
  return receipts(presenceId).find((s) => s.track === track && s.seq === seq) ?? null;
}

export function readSegmentBytes(presenceId: string, track: Track, seq: number): Buffer | null {
  if (!isValidPresenceId(presenceId)) return null;
  try {
    return readFileSync(segmentPath(presenceId, track, seq));
  } catch {
    return null;
  }
}

export function segmentsFor(presenceId: string, track: Track): StoredSegment[] {
  return receipts(presenceId)
    .filter((s) => s.track === track)
    .sort((a, b) => a.seq - b.seq);
}

/**
 * Sequence numbers the server already holds.
 *
 * This is what makes resumable upload work: after a twenty-minute blackout the
 * client asks what arrived, and re-sends only what did not. Without it a client
 * either re-uploads everything (wasting the data bundle we paid for) or assumes
 * success and loses content.
 */
export function receivedSeqs(presenceId: string, track: Track): number[] {
  return segmentsFor(presenceId, track).map((s) => s.seq);
}

// ---------------------------------------------------------- completeness ---

export function completeness(meta: PresenceMeta): Completeness {
  const captured = Math.max(0, Math.floor(meta.capturedThroughSec));
  const covered: Record<Track, Uint8Array> = {
    a: new Uint8Array(captured),
    v: new Uint8Array(captured),
  };

  for (const track of TRACKS) {
    for (const s of segmentsFor(meta.id, track)) {
      const start = Math.max(0, Math.floor(s.capturedAt));
      const end = Math.min(captured, start + Math.max(1, s.coversSec));
      for (let i = start; i < end; i++) covered[track][i] = 1;
    }
  }

  const count = (t: Track) => covered[t].reduce((n, v) => n + v, 0);
  const audioSec = count("a");
  const videoSec = count("v");

  const gaps: Gap[] = [];
  for (const track of TRACKS) {
    let open: number | null = null;
    for (let i = 0; i < captured; i++) {
      if (covered[track][i] === 0 && open === null) open = i;
      if (covered[track][i] === 1 && open !== null) {
        gaps.push({ track, fromSec: open, toSec: i });
        open = null;
      }
    }
    if (open !== null) gaps.push({ track, fromSec: open, toSec: captured });
  }

  return {
    capturedSec: captured,
    audioSec,
    videoSec,
    // Audio is the payload (docs/01), so it gets its own headline number.
    audioRatio: captured === 0 ? 1 : audioSec / captured,
    // The guarantee is about the archive as a whole, and audio is what makes
    // an event watchable, so overall completeness follows the audio track.
    overallRatio: captured === 0 ? 1 : audioSec / captured,
    gaps,
  };
}

// ------------------------------------------------------------- lifecycle ---

export function openCapture(
  meta: PresenceMeta,
  mimeType?: { v?: string | null; a?: string | null },
): PresenceMeta {
  const updated: PresenceMeta = {
    ...meta,
    mimeType: {
      v: mimeType?.v ?? meta.mimeType?.v ?? null,
      a: mimeType?.a ?? meta.mimeType?.a ?? null,
    },
    state: "live",
    openedAtMs: meta.openedAtMs ?? Date.now(),
  };
  saveMeta(updated);
  return updated;
}

export function recordProgress(
  meta: PresenceMeta,
  capturedThroughSec: number,
  telemetry: Telemetry | null,
): PresenceMeta {
  const updated: PresenceMeta = {
    ...meta,
    // Monotonic: a late-arriving segment from earlier in the event must never
    // make the event look shorter than it already is.
    capturedThroughSec: Math.max(meta.capturedThroughSec, capturedThroughSec),
    telemetry: telemetry ?? meta.telemetry,
  };
  saveMeta(updated);
  invalidate(meta.id);
  return updated;
}

export function closeCapture(meta: PresenceMeta): PresenceMeta {
  invalidate(meta.id);
  const done = completeness(meta);
  const updated: PresenceMeta = {
    ...meta,
    // "ended" means the camera stopped. "complete" means the archive arrived —
    // and those are different moments, sometimes hours apart, which is the
    // whole point of store-and-forward.
    state: done.overallRatio >= 1 ? "complete" : "ended",
    endedAtMs: meta.endedAtMs ?? Date.now(),
  };
  saveMeta(updated);
  return updated;
}

/** Re-checks whether a backfilled Presence has become complete. */
export function refreshCompletion(meta: PresenceMeta): PresenceMeta {
  invalidate(meta.id);
  // Only a presence whose camera has stopped can become complete. A live one
  // is still being filmed, however much of it has arrived so far.
  if (meta.state !== "ended") return meta;
  const done = completeness(meta);
  if (done.overallRatio < 1) return meta;
  const updated: PresenceMeta = { ...meta, state: "complete" };
  saveMeta(updated);
  return updated;
}

export function notePut(presenceId: string): void {
  invalidate(presenceId);
}

export function destroyAll(): void {
  indexCache = new Map();
  rmSync(ROOT, { recursive: true, force: true });
}

export { ROOT as MEDIA_ROOT };
