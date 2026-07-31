import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const MEDIA_DIR = mkdtempSync(join(tmpdir(), "elongo-media-test-"));
process.env.ELONGO_MEDIA_DIR = MEDIA_DIR;
process.env.ELONGO_TOKEN_SECRET = "test-secret-not-for-production";
process.env.PORT = "0";

const { server } = await import("../src/server.ts");
const { issueToken, revokeViewer, verifyToken, clearRevocations } = await import("../src/tokens.ts");

let base = "";

before(async () => {
  await new Promise<void>((resolve) => {
    if (server.listening) return resolve();
    server.once("listening", () => resolve());
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
});

let n = 0;
async function makePresence(): Promise<{ id: string; key: string; token: string }> {
  const id = `test${Date.now().toString(36)}${n++}`;
  const res = await fetch(`${base}/dev/presence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, eventName: "Mariage de Grace" }),
  });
  const body = (await res.json()) as { captureKey: string; viewerToken: string };
  return { id, key: body.captureKey, token: body.viewerToken };
}

function segmentBody(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

async function put(
  id: string,
  key: string,
  track: "a" | "v",
  seq: number,
  body: Buffer,
  opts: { capturedAt?: number; coversSec?: number; sha?: string | null; rung?: number } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "x-elongo-key": key,
    "x-captured-at": String(opts.capturedAt ?? seq),
    "x-covers-sec": String(opts.coversSec ?? 1),
    "x-rung": String(opts.rung ?? 1),
  };
  const sha = opts.sha === null ? null : (opts.sha ?? createHash("sha256").update(body).digest("hex"));
  if (sha) headers["x-segment-sha256"] = sha;
  return fetch(`${base}/ingest/${id}/${track}/${seq}`, { method: "PUT", headers, body });
}

async function progress(id: string, key: string, sec: number, rung = 1): Promise<void> {
  await fetch(`${base}/ingest/${id}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-elongo-key": key },
    body: JSON.stringify({
      capturedThroughSec: sec,
      telemetry: { rung, rungName: "480p24", batteryPct: 62, uplinkKbps: 800, backlogSec: 0, screenOn: true },
    }),
  });
}

describe("ingest authentication", () => {
  it("refuses a wrong capture key", async () => {
    const { id } = await makePresence();
    const res = await put(id, "wrong-key", "a", 1, segmentBody("x"));
    assert.equal(res.status, 401);
  });

  it("refuses an unknown presence", async () => {
    const res = await put("doesnotexist", "k", "a", 1, segmentBody("x"));
    assert.equal(res.status, 404);
  });

  it("refuses an empty segment", async () => {
    const { id, key } = await makePresence();
    assert.equal((await put(id, key, "a", 1, Buffer.alloc(0))).status, 400);
  });
});

describe("segments are idempotent", () => {
  it("accepts a segment once", async () => {
    const { id, key } = await makePresence();
    const res = await put(id, key, "a", 1, segmentBody("hello"));
    assert.equal(res.status, 201);
    assert.equal(((await res.json()) as { status: string }).status, "stored");
  });

  it("treats a re-send of identical bytes as a duplicate, not an error", async () => {
    // The normal outcome of a retry after an ambiguous failure, which on a
    // Congolese uplink is the common case rather than the exception.
    const { id, key } = await makePresence();
    const body = segmentBody("hello");
    await put(id, key, "a", 1, body);
    const again = await put(id, key, "a", 1, body);
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { status: string }).status, "duplicate");
  });

  it("refuses to overwrite a sequence with different content", async () => {
    const { id, key } = await makePresence();
    await put(id, key, "a", 1, segmentBody("original"));
    const clash = await put(id, key, "a", 1, segmentBody("different"));
    assert.equal(clash.status, 409);
  });

  it("rejects bytes that do not match the declared hash", async () => {
    // Silently accepting these would corrupt the family's archive in a way
    // nobody discovers until they sit down to watch it.
    const { id, key } = await makePresence();
    const res = await put(id, key, "a", 1, segmentBody("real"), { sha: "0".repeat(64) });
    assert.equal(res.status, 422);
  });
});

describe("segments arrive out of order", () => {
  it("accepts a late segment from earlier in the event", async () => {
    const { id, key } = await makePresence();
    await put(id, key, "a", 5, segmentBody("five"), { capturedAt: 5 });
    await put(id, key, "a", 1, segmentBody("one"), { capturedAt: 1 });
    await put(id, key, "a", 3, segmentBody("three"), { capturedAt: 3 });

    const status = await (
      await fetch(`${base}/ingest/${id}/status`, { headers: { "x-elongo-key": key } })
    ).json() as { received: { a: number[] } };
    assert.deepEqual(status.received.a, [1, 3, 5]);
  });

  it("never lets a late segment shorten the event", async () => {
    const { id, key } = await makePresence();
    await progress(id, key, 100);
    await progress(id, key, 20);
    const status = await (
      await fetch(`${base}/ingest/${id}/status`, { headers: { "x-elongo-key": key } })
    ).json() as { capturedThroughSec: number };
    assert.equal(status.capturedThroughSec, 100);
  });
});

describe("completeness — the number the refund guarantee rests on", () => {
  it("reports gaps while content is missing", async () => {
    const { id, key } = await makePresence();
    await progress(id, key, 10);
    for (const s of [0, 1, 2, 7, 8, 9]) {
      await put(id, key, "a", s, segmentBody(`a${s}`), { capturedAt: s });
    }
    const status = await (
      await fetch(`${base}/ingest/${id}/status`, { headers: { "x-elongo-key": key } })
    ).json() as { completeness: { overallRatio: number; gaps: Array<{ fromSec: number; toSec: number }> } };

    assert.ok(status.completeness.overallRatio < 1);
    const audioGap = status.completeness.gaps.find((g) => g.fromSec === 3);
    assert.ok(audioGap, "expected a gap covering the missing middle");
    assert.equal(audioGap.toSec, 7);
  });

  it("reaches 100% once the backfill arrives, hours later", async () => {
    // The whole promise of store-and-forward: the network died, the camera did
    // not, and the archive completes when the link comes back.
    const { id, key } = await makePresence();
    await progress(id, key, 10);
    for (const s of [0, 1, 2, 7, 8, 9]) {
      await put(id, key, "a", s, segmentBody(`a${s}`), { capturedAt: s });
    }
    await fetch(`${base}/ingest/${id}/close`, { method: "POST", headers: { "x-elongo-key": key } });

    for (const s of [3, 4, 5, 6]) {
      await put(id, key, "a", s, segmentBody(`a${s}`), { capturedAt: s });
    }

    const status = await (
      await fetch(`${base}/ingest/${id}/status`, { headers: { "x-elongo-key": key } })
    ).json() as { completeness: { overallRatio: number }; state: string };

    assert.equal(status.completeness.overallRatio, 1);
    assert.equal(status.state, "complete", "a backfilled presence should become complete");
  });

  it("counts a still for every second it holds the screen", async () => {
    const { id, key } = await makePresence();
    await progress(id, key, 8);
    // Two stills at the photo-call rung, each covering four seconds.
    await put(id, key, "v", 0, segmentBody("still-1"), { capturedAt: 0, coversSec: 4 });
    await put(id, key, "v", 1, segmentBody("still-2"), { capturedAt: 4, coversSec: 4 });
    const status = await (
      await fetch(`${base}/ingest/${id}/status`, { headers: { "x-elongo-key": key } })
    ).json() as { completeness: { videoSec: number } };
    assert.equal(status.completeness.videoSec, 8);
  });
});

describe("viewer tokens", () => {
  it("lets a valid token fetch the manifest", async () => {
    const { id, token } = await makePresence();
    const res = await fetch(`${base}/media/${id}/manifest.json?t=${encodeURIComponent(token)}`);
    assert.equal(res.status, 200);
    const m = (await res.json()) as { eventName: string };
    assert.equal(m.eventName, "Mariage de Grace");
  });

  it("refuses a missing or malformed token", async () => {
    const { id } = await makePresence();
    assert.equal((await fetch(`${base}/media/${id}/manifest.json`)).status, 403);
    assert.equal((await fetch(`${base}/media/${id}/manifest.json?t=rubbish`)).status, 403);
  });

  it("refuses a token minted for a different presence", async () => {
    const a = await makePresence();
    const b = await makePresence();
    const res = await fetch(`${base}/media/${b.id}/manifest.json?t=${encodeURIComponent(a.token)}`);
    assert.equal(res.status, 403);
  });

  it("refuses a token whose signature was tampered with", async () => {
    const { id, token } = await makePresence();
    const parts = token.split(".");
    parts[2] = String(Number(parts[2]) + 60_000); // extend the expiry
    const forged = parts.join(".");
    assert.equal(verifyToken(forged, id).ok, false);
  });

  it("expires", () => {
    const token = issueToken("somepresence", "viewer", -1000);
    const check = verifyToken(token, "somepresence");
    assert.equal(check.ok, false);
    assert.equal(check.ok === false && check.reason, "expired");
  });

  it("can cut off one viewer without breaking everyone else's link", async () => {
    const { id, token } = await makePresence();
    const other = issueToken(id, "cousin");
    revokeViewer(id, "dev-viewer");

    assert.equal((await fetch(`${base}/media/${id}/manifest.json?t=${encodeURIComponent(token)}`)).status, 403);
    assert.equal((await fetch(`${base}/media/${id}/manifest.json?t=${encodeURIComponent(other)}`)).status, 200);
    clearRevocations();
  });
});

describe("playback", () => {
  it("serves stored segments to an authorised viewer", async () => {
    const { id, key, token } = await makePresence();
    await put(id, key, "a", 1, segmentBody("audio-bytes"), { capturedAt: 1 });
    const res = await fetch(`${base}/media/${id}/a/1?t=${encodeURIComponent(token)}`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "audio-bytes");
  });

  it("marks segments immutable so a CDN can cache them hard", async () => {
    const { id, key, token } = await makePresence();
    await put(id, key, "a", 1, segmentBody("x"), { capturedAt: 1 });
    const res = await fetch(`${base}/media/${id}/a/1?t=${encodeURIComponent(token)}`);
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
  });

  it("404s a segment that does not exist", async () => {
    const { id, token } = await makePresence();
    assert.equal((await fetch(`${base}/media/${id}/a/999?t=${encodeURIComponent(token)}`)).status, 404);
  });

  it("lists segments in the manifest with playable urls", async () => {
    const { id, key, token } = await makePresence();
    await progress(id, key, 3);
    await put(id, key, "a", 0, segmentBody("a0"), { capturedAt: 0 });
    await put(id, key, "v", 0, segmentBody("v0"), { capturedAt: 0 });

    const m = (await (
      await fetch(`${base}/media/${id}/manifest.json?t=${encodeURIComponent(token)}`)
    ).json()) as { segments: { a: Array<{ url: string }>; v: Array<{ url: string }> } };

    assert.equal(m.segments.a.length, 1);
    assert.equal(m.segments.v.length, 1);
    const res = await fetch(`${base}${m.segments.a[0].url}`);
    assert.equal(res.status, 200, "manifest urls should be directly fetchable");
  });
});

describe("the honest status line", () => {
  async function labelFor(rung: number, screenOn = true): Promise<string> {
    const { id, key, token } = await makePresence();
    await fetch(`${base}/ingest/${id}/open`, { method: "POST", headers: { "x-elongo-key": key } });
    await fetch(`${base}/ingest/${id}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-elongo-key": key },
      body: JSON.stringify({
        capturedThroughSec: 10,
        telemetry: { rung, rungName: "x", batteryPct: 40, uplinkKbps: 300, backlogSec: 0, screenOn },
      }),
    });
    const m = (await (
      await fetch(`${base}/media/${id}/manifest.json?t=${encodeURIComponent(token)}`)
    ).json()) as { status: { label: string; tone: string } };
    return `${m.status.tone}|${m.status.label}`;
  }

  it("never shows a bare spinner when the network is gone", async () => {
    // docs/02: the customer's anxiety is uncertainty, not low quality.
    const label = await labelFor(7);
    assert.match(label, /^offline\|/);
    assert.match(label, /vous ne perdez rien/);
  });

  it("explains the audio floor rather than just showing a frozen frame", async () => {
    assert.match(await labelFor(6), /audio seul/);
    assert.match(await labelFor(5), /audio et photos/);
  });

  it("names power saving as a choice, not a failure", async () => {
    assert.match(await labelFor(3, false), /économie d'énergie/);
  });

  it("says so plainly when things are fine", async () => {
    assert.match(await labelFor(1), /^good\|Bonne connexion/);
  });
});

describe("path safety", () => {
  it("refuses presence ids that could escape the media directory", async () => {
    for (const bad of ["../etc", "..%2f..%2fetc", "a/b"]) {
      const res = await fetch(`${base}/media/${bad}/manifest.json?t=x`, { redirect: "manual" });
      assert.ok(res.status === 404 || res.status >= 300, `${bad} returned ${res.status}`);
    }
  });
});
