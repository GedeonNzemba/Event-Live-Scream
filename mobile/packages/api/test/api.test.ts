import assert from "node:assert/strict";
import { test } from "node:test";

import { MediaClient } from "../src/media-client.ts";
import { ApiError, backoffMs, classify, retriableStatus } from "../src/retry.ts";

/** A scripted fetch. Each entry is consumed in order; the last one repeats. */
function scripted(steps: (number | "network")[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetch = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if (step === "network") throw new TypeError("Network request failed");
    return new Response(JSON.stringify({ status: "stored", state: "live", ok: true }), {
      status: step,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch, calls };
}

function client(steps: (number | "network")[], overrides = {}) {
  const { fetch, calls } = scripted(steps);
  const slept: number[] = [];
  const c = new MediaClient({
    baseUrl: "https://media.example/",
    fetch,
    sleep: async (ms) => { slept.push(ms); },
    retry: { baseMs: 100, capMs: 1000, maxAttempts: 20, random: () => 1 },
    ...overrides,
  });
  return { c, calls, slept };
}

const SEG = {
  presenceId: "demo",
  key: "k",
  track: "v" as const,
  seq: 7,
  capturedAt: 14,
  coversSec: 2,
  rung: 3,
  body: new Uint8Array([1, 2, 3]),
};

// ----------------------------------------------------------------- policy --

test("a 4xx is an answer, not a hiccup", () => {
  // Retrying a 401 with the same bad key produces the same 401 for three hours
  // while the real problem — a mistyped capture key — goes unreported.
  assert.equal(retriableStatus(400), false);
  assert.equal(retriableStatus(401), false);
  assert.equal(retriableStatus(403), false);
  assert.equal(retriableStatus(409), false);
  assert.equal(retriableStatus(422), false);
});

test("'not now' is retried; 'no' is not", () => {
  assert.equal(retriableStatus(408), true);
  assert.equal(retriableStatus(429), true);
  assert.equal(retriableStatus(500), true);
  assert.equal(retriableStatus(503), true);
});

test("no response at all is classified as network, not as refusal", () => {
  assert.equal(classify(null), "network");
  assert.equal(classify(503), "transient");
  assert.equal(classify(401), "rejected");
});

test("backoff grows, is capped, and is jittered", () => {
  const policy = { baseMs: 500, capMs: 5000, maxAttempts: 99, random: () => 1 };
  assert.equal(backoffMs(0, policy), 500);
  assert.equal(backoffMs(1, policy), 1000);
  assert.equal(backoffMs(2, policy), 2000);
  assert.equal(backoffMs(10, policy), 5000, "backoff must cap, or a dead link waits hours");
  assert.equal(backoffMs(3, { ...policy, random: () => 0 }), 0, "full jitter must reach zero");
});

test("jitter spreads a village's reconnect instead of synchronising it", () => {
  // When a cell recovers, every phone on it retries at once. Two clients with
  // different random draws must not choose the same instant.
  const a = backoffMs(4, { baseMs: 500, capMs: 30_000, maxAttempts: 99, random: () => 0.13 });
  const b = backoffMs(4, { baseMs: 500, capMs: 30_000, maxAttempts: 99, random: () => 0.87 });
  assert.notEqual(a, b);
});

// -------------------------------------------------------------- transport --

test("a transient failure is retried and then succeeds", async () => {
  const { c, calls } = client([503, 503, 201]);
  const outcome = await c.putSegment(SEG);
  assert.equal(outcome, "stored");
  assert.equal(calls.length, 3);
});

test("a network failure is retried — the bytes are still on disk", async () => {
  const { c, calls, slept } = client(["network", "network", 201]);
  assert.equal(await c.putSegment(SEG), "stored");
  assert.equal(calls.length, 3);
  assert.deepEqual(slept, [100, 200]);
});

test("a rejection stops immediately instead of hammering", async () => {
  const { c, calls } = client([401]);
  await assert.rejects(
    () => c.putSegment(SEG),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 401);
      assert.equal(err.kind, "rejected");
      assert.equal(err.retriable, false);
      return true;
    },
  );
  assert.equal(calls.length, 1, "a refused key was retried");
});

test("a 409 conflict is not retried — that is a client bug, not a bad cell", async () => {
  const { c, calls } = client([409]);
  await assert.rejects(() => c.putSegment(SEG), ApiError);
  assert.equal(calls.length, 1);
});

test("giving up reports how many attempts it took", async () => {
  const { c } = client(["network"], { retry: { baseMs: 1, capMs: 1, maxAttempts: 4, random: () => 0 } });
  await assert.rejects(
    () => c.putSegment(SEG),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.attempts, 4);
      assert.equal(err.kind, "network");
      assert.equal(err.retriable, true, "a network failure is always worth trying again later");
      return true;
    },
  );
});

test("a stalled socket is aborted rather than freezing the queue", async () => {
  let aborted = false;
  const fetch = async (_url: string, init: RequestInit = {}) => {
    return await new Promise<Response>((resolve, reject) => {
      const signal = init.signal;
      signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
      // Never resolves on its own: a half-open connection on a dead cell.
      setTimeout(() => resolve(new Response("{}", { status: 200 })), 60_000).unref?.();
    });
  };
  const c = new MediaClient({
    baseUrl: "https://media.example",
    fetch,
    sleep: async () => {},
    timeoutMs: 20,
    retry: { baseMs: 1, capMs: 1, maxAttempts: 2, random: () => 0 },
  });
  await assert.rejects(() => c.putSegment(SEG));
  assert.equal(aborted, true, "the request hung instead of being abandoned");
});

// ----------------------------------------------------------------- ingest --

test("the capture key travels on every ingest call and never in the URL", async () => {
  const { c, calls } = client([200]);
  await c.status("demo", "secret-key");
  assert.equal(calls[0].init.headers?.["x-elongo-key" as never], "secret-key");
  assert.ok(!calls[0].url.includes("secret-key"), "the capture key leaked into the URL");
});

test("a segment carries its capture time, coverage and rung", async () => {
  // Without x-captured-at the server timestamps at *delivery*, which puts a
  // twenty-minute backfill at the wrong place in the recording. That shipped
  // once and left a permanent hole at the start of every event.
  const { c, calls } = client([201]);
  await c.putSegment({ ...SEG, sha256: "abc123" });
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h["x-captured-at"], "14");
  assert.equal(h["x-covers-sec"], "2");
  assert.equal(h["x-rung"], "3");
  assert.equal(h["x-segment-sha256"], "abc123");
  assert.equal(calls[0].init.method, "PUT");
  assert.match(calls[0].url, /\/ingest\/demo\/v\/7$/);
});

test("a duplicate is a success, because the upload is idempotent", async () => {
  // The normal failure on a Congolese uplink is ambiguous: the request went
  // out, the answer never came back. Re-sending must be free.
  let calls = 0;
  const c = new MediaClient({
    baseUrl: "https://media.example",
    sleep: async () => {},
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: "duplicate" }), { status: 200 });
    },
  });
  assert.equal(await c.putSegment(SEG), "duplicate");
  assert.equal(calls, 1, "a duplicate must not trigger a retry");
});

test("status reports what arrived so only the difference is re-sent", async () => {
  const payload = {
    state: "live",
    capturedThroughSec: 120,
    received: { a: [1, 2, 3], v: [1, 3] },
    completeness: { heardRatio: 1, sawRatio: 0.66, overallRatio: 0.83 },
  };
  const c = new MediaClient({
    baseUrl: "https://media.example",
    fetch: async () => new Response(JSON.stringify(payload), { status: 200 }),
    sleep: async () => {},
  });
  const status = await c.status("demo", "k");
  assert.deepEqual(status.received.v, [1, 3]);
  assert.equal(status.capturedThroughSec, 120);
});

test("close is a real call, not a fire-and-forget", async () => {
  // The web client shipped with this call accidentally dropped, which left
  // every event marked live forever.
  const { c, calls } = client([200]);
  await c.close("demo", "k");
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].url, /\/ingest\/demo\/close$/);
});

test("close retries — an event stuck in 'live' is a visible failure", async () => {
  const { c, calls } = client(["network", 500, 200]);
  await c.close("demo", "k");
  assert.equal(calls.length, 3);
});

// --------------------------------------------------------------- playback --

test("the viewer token is URL-encoded, not concatenated", async () => {
  const { c, calls } = client([200]);
  await c.manifest("demo", "a b+c/d=");
  assert.ok(calls[0].url.includes("t=a%20b%2Bc%2Fd%3D"), calls[0].url);
});

test("segment URLs are absolute, for expo-video and the downloader", () => {
  const { c } = client([200]);
  const url = c.segmentUrl("demo", "a", 42, "tok");
  assert.equal(url, "https://media.example/media/demo/a/42?t=tok");
});

test("a trailing slash on the base URL does not produce a double slash", () => {
  const { c } = client([200]);
  assert.ok(!c.segmentUrl("demo", "a", 1, "t").includes("//media/"));
});

test("the viewer never sends a capture key", async () => {
  const { c, calls } = client([200]);
  await c.manifest("demo", "tok");
  const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
  assert.equal(headers["x-elongo-key"], undefined);
});

test("an expired viewer token fails fast instead of retrying for an hour", async () => {
  const { c, calls } = client([403]);
  await assert.rejects(() => c.manifest("demo", "stale"), ApiError);
  assert.equal(calls.length, 1);
});
