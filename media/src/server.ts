import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildManifest } from "./manifest.ts";
import {
  closeCapture,
  completeness,
  createPresence,
  getMeta,
  listPresences,
  notePut,
  openCapture,
  putSegment,
  readSegmentBytes,
  receivedSeqs,
  recordProgress,
  refreshCompletion,
} from "./store.ts";
import { issueToken, keyMatches, verifyToken } from "./tokens.ts";
import { isTrack, type Telemetry } from "./types.ts";

/**
 * The media service.
 *
 * Two audiences, deliberately separated:
 *
 *   /ingest/*   the capture client in Brazzaville. Authenticated with a
 *               per-Presence key. Writes only.
 *   /media/*    the family abroad. Authenticated with a signed, expiring,
 *               revocable viewer token. Reads only.
 *
 * The ingest side is built around the assumption that every request may fail
 * ambiguously and be retried — which on a Congolese uplink is the normal case,
 * not the exception. Every write is therefore idempotent.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "..", "public");
const PORT = Number(process.env.PORT ?? 3100);
const MAX_SEGMENT_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------- helpers --

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(text);
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req, 64 * 1024);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Authenticates the capture client. */
function authoriseCapture(req: IncomingMessage, presenceId: string) {
  const meta = getMeta(presenceId);
  if (!meta) return { ok: false as const, status: 404, error: "unknown presence" };
  const supplied = (req.headers["x-elongo-key"] as string) ?? "";
  if (!keyMatches(supplied, meta.captureKey)) {
    return { ok: false as const, status: 401, error: "bad capture key" };
  }
  return { ok: true as const, meta };
}

/** Authenticates a viewer. */
function authoriseViewer(url: URL, presenceId: string) {
  const meta = getMeta(presenceId);
  if (!meta) return { ok: false as const, status: 404, error: "unknown presence" };
  const token = url.searchParams.get("t") ?? "";
  const check = verifyToken(token, presenceId);
  if (!check.ok) {
    // 403 for every failure mode: distinguishing "expired" from "forged" tells
    // an attacker which half of the token to keep working on.
    return { ok: false as const, status: 403, error: check.reason };
  }
  return { ok: true as const, meta, viewerId: check.viewerId };
}

function telemetryFrom(raw: unknown): Telemetry | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  return {
    rung: Math.max(0, Math.min(7, num(t.rung))),
    rungName: String(t.rungName ?? ""),
    batteryPct: t.batteryPct === null || t.batteryPct === undefined ? null : num(t.batteryPct),
    uplinkKbps: num(t.uplinkKbps),
    backlogSec: num(t.backlogSec),
    screenOn: Boolean(t.screenOn),
    atMs: Date.now(),
  };
}

// ----------------------------------------------------------------- routes --

const STATIC: Record<string, string> = {
  "/player.html": "text/html; charset=utf-8",
  "/player.js": "text/javascript; charset=utf-8",
  "/capture.html": "text/html; charset=utf-8",
  "/capture.js": "text/javascript; charset=utf-8",
  "/media.css": "text/css; charset=utf-8",
};

async function serveStatic(res: ServerResponse, path: string): Promise<boolean> {
  const type = STATIC[path];
  if (!type) return false;
  try {
    const body = await readFile(join(PUBLIC, path.slice(1)));
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && (await serveStatic(res, path))) return;

  // --- development helpers -------------------------------------------------

  if (method === "POST" && path === "/dev/presence") {
    const body = await readJson(req);
    const id = String(body.id ?? "").trim();
    const eventName = String(body.eventName ?? "Événement");
    if (!id) return json(res, 400, { error: "id required" });
    const existing = getMeta(id);
    const meta = existing ?? createPresence(id, eventName);
    return json(res, existing ? 200 : 201, {
      id: meta.id,
      captureKey: meta.captureKey,
      eventName: meta.eventName,
      state: meta.state,
      viewerToken: issueToken(meta.id, "dev-viewer"),
    });
  }

  if (method === "GET" && path === "/dev/presences") {
    return json(res, 200, {
      presences: listPresences().map((m) => ({
        id: m.id,
        eventName: m.eventName,
        state: m.state,
        capturedThroughSec: m.capturedThroughSec,
        completeness: completeness(m).overallRatio,
      })),
    });
  }

  if (method === "GET" && path === "/dev/token") {
    const id = url.searchParams.get("id") ?? "";
    const viewer = url.searchParams.get("viewer") ?? "dev-viewer";
    if (!getMeta(id)) return json(res, 404, { error: "unknown presence" });
    return json(res, 200, { token: issueToken(id, viewer) });
  }

  // --- ingest --------------------------------------------------------------

  const ingest = /^\/ingest\/([A-Za-z0-9_-]{4,64})\/(open|close|progress|status)$/.exec(path);
  if (ingest) {
    const [, presenceId, action] = ingest;
    const auth = authoriseCapture(req, presenceId);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    if (method === "POST" && action === "open") {
      const body = await readJson(req);
      const mt = (body.mimeType ?? {}) as Record<string, unknown>;
      const meta = openCapture(auth.meta, {
        v: typeof mt.v === "string" ? mt.v : null,
        a: typeof mt.a === "string" ? mt.a : null,
      });
      return json(res, 200, { ok: true, state: meta.state, mimeType: meta.mimeType });
    }

    if (method === "POST" && action === "progress") {
      const body = await readJson(req);
      const meta = recordProgress(
        auth.meta,
        num(body.capturedThroughSec),
        telemetryFrom(body.telemetry),
      );
      return json(res, 200, { ok: true, completeness: completeness(meta) });
    }

    if (method === "POST" && action === "close") {
      const meta = closeCapture(auth.meta);
      return json(res, 200, { ok: true, state: meta.state, completeness: completeness(meta) });
    }

    if (method === "GET" && action === "status") {
      // Reconciliation. After an outage the client asks what actually arrived
      // and re-sends only the difference — without this it either re-uploads
      // everything, wasting the data bundle we paid for, or assumes success
      // and silently loses content.
      const meta = refreshCompletion(auth.meta);
      return json(res, 200, {
        state: meta.state,
        capturedThroughSec: meta.capturedThroughSec,
        received: { a: receivedSeqs(presenceId, "a"), v: receivedSeqs(presenceId, "v") },
        completeness: completeness(meta),
      });
    }
  }

  const put = /^\/ingest\/([A-Za-z0-9_-]{4,64})\/(a|v)\/(\d{1,9})$/.exec(path);
  if (put && method === "PUT") {
    const [, presenceId, trackRaw, seqRaw] = put;
    if (!isTrack(trackRaw)) return json(res, 400, { error: "bad track" });

    const auth = authoriseCapture(req, presenceId);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    let body: Buffer;
    try {
      body = await readBody(req, MAX_SEGMENT_BYTES);
    } catch {
      return json(res, 413, { error: "segment too large" });
    }
    if (body.length === 0) return json(res, 400, { error: "empty segment" });

    const result = putSegment({
      presenceId,
      track: trackRaw,
      seq: Number(seqRaw),
      capturedAt: num(req.headers["x-captured-at"]),
      coversSec: num(req.headers["x-covers-sec"], 1),
      rung: num(req.headers["x-rung"]),
      declaredSha256: (req.headers["x-segment-sha256"] as string) ?? null,
      body,
    });
    notePut(presenceId);

    if (result.status === "corrupt") return json(res, 422, { error: result.reason });
    if (result.status === "conflict") return json(res, 409, { error: result.reason });
    return json(res, result.status === "duplicate" ? 200 : 201, {
      status: result.status,
      seq: result.segment.seq,
      sha256: result.segment.sha256,
    });
  }

  // --- playback ------------------------------------------------------------

  const manifest = /^\/media\/([A-Za-z0-9_-]{4,64})\/manifest\.json$/.exec(path);
  if (manifest && method === "GET") {
    const presenceId = manifest[1];
    const auth = authoriseViewer(url, presenceId);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const meta = refreshCompletion(auth.meta);
    return json(res, 200, buildManifest(meta, url.searchParams.get("t") ?? ""));
  }

  const seg = /^\/media\/([A-Za-z0-9_-]{4,64})\/(a|v)\/(\d{1,9})$/.exec(path);
  if (seg && method === "GET") {
    const [, presenceId, trackRaw, seqRaw] = seg;
    if (!isTrack(trackRaw)) return json(res, 400, { error: "bad track" });

    const auth = authoriseViewer(url, presenceId);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    const bytes = readSegmentBytes(presenceId, trackRaw, Number(seqRaw));
    if (!bytes) return json(res, 404, { error: "no such segment" });

    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.length),
      // Segments are immutable once written, so they cache hard — this is what
      // makes a CDN cheap in front of them (docs/10).
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
    res.end(bytes);
    return;
  }

  json(res, 404, { error: "not found" });
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("media request failed:", err);
    if (!res.headersSent) json(res, 500, { error: "internal error" });
    else res.end();
  });
});

server.listen(PORT, () => {
  if (PORT === 0) return;
  const addr = server.address();
  const port = addr && typeof addr !== "string" ? addr.port : PORT;
  console.log("");
  console.log("  Elongo — media service");
  console.log("");
  console.log(`  Capture      http://localhost:${port}/capture.html`);
  console.log(`  Player       http://localhost:${port}/player.html`);
  console.log("");
  console.log(`  Create a test presence:`);
  console.log(`    curl -s -X POST http://localhost:${port}/dev/presence \\`);
  console.log(`      -H 'content-type: application/json' \\`);
  console.log(`      -d '{"id":"demo","eventName":"Mariage de Grace"}'`);
  console.log("");
});

export { handle, server };
