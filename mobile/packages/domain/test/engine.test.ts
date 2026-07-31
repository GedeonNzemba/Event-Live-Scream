import assert from "node:assert/strict";
import { test } from "node:test";

import { CaptureEngine, type EngineStore, type EngineTransport } from "../src/engine.ts";
import { BUFFERED_RUNG, FLOOR_RUNG } from "../src/ladder.ts";
import type { PendingSegment, Track } from "../src/segments.ts";
import type { PowerState } from "../src/power.ts";

/**
 * A simulated event.
 *
 * This is the mobile equivalent of `prototype/`: the engine driven a tick at a
 * time against a link that can be told to fail. The claim under test is the one
 * the whole company rests on — *everything arrives, some of it late* — and it
 * is checked by counting what the fake server actually holds at the end.
 */

const LIVE_WINDOW = 15;
const SEG_SEC = 2;

class FakeStore implements EngineStore {
  private queue: PendingSegment[] = [];
  captured = 0;

  capture(atSec: number, rung: number): void {
    const seq = Math.floor(atSec / SEG_SEC);
    this.queue.push({ seq, track: "a", capturedAt: atSec, bytes: 6_000, rung });
    this.captured += 1;
    if (rung < FLOOR_RUNG) {
      this.queue.push({ seq, track: "v", capturedAt: atSec, bytes: 40_000, rung });
      this.captured += 1;
    }
  }

  pending(): readonly PendingSegment[] {
    return this.queue;
  }

  acknowledge(track: Track, seq: number): void {
    this.queue = this.queue.filter((s) => !(s.track === track && s.seq === seq));
  }
}

/**
 * A link that can be slow, or down, but never both by accident.
 *
 * The distinction is the whole design. A *slow* link does not fail requests, it
 * makes them take longer: QUIC retransmits, so loss is charged against goodput
 * rather than against content. A transport that rejected whenever it was over
 * capacity would teach the engine that "congested" and "offline" are the same
 * thing, and the engine would then be tested against a world that does not
 * exist. So an over-capacity send here *stalls* into later ticks, exactly as a
 * resumable upload does, and only `up = false` rejects.
 */
class FakeLink implements EngineTransport {
  up = true;
  received: Record<Track, Set<number>> = { a: new Set(), v: new Set() };
  /** Bytes the link carries per tick. Unspent capacity does not accumulate. */
  capacityBytes = 1_000_000;
  progressCalls = 0;
  statusCalls = 0;
  /** Segments the server stored but whose acknowledgement never came back. */
  ackLost = new Set<string>();

  private waiting: { remaining: number; done: () => void; fail: (e: Error) => void }[] = [];

  /**
   * Advance one second: grant capacity, then serve the queue in order.
   *
   * Progress on the head of the queue is *partial and cumulative*, which is
   * what makes an upload resumable. A model that only ever completed whole
   * segments would let one 40 KB video permanently starve a 6 KB audio segment
   * behind it on a 32 kbps link, and the engine would be tuned against a
   * pathology no real uploader has.
   */
  newTick(): void {
    if (!this.up) {
      const stalled = this.waiting;
      this.waiting = [];
      for (const w of stalled) w.fail(new Error("link went away mid-upload"));
      return;
    }
    let credit = this.capacityBytes;
    while (this.waiting.length > 0 && credit > 0) {
      const head = this.waiting[0];
      const take = Math.min(head.remaining, credit);
      head.remaining -= take;
      credit -= take;
      if (head.remaining > 0) break;
      this.waiting.shift();
      head.done();
    }
  }

  send(segment: PendingSegment): Promise<void> {
    if (!this.up) return Promise.reject(new Error("no network"));
    return new Promise<void>((resolve, reject) => {
      this.waiting.push({
        remaining: segment.bytes,
        done: () => {
          this.received[segment.track].add(segment.seq);
          if (this.ackLost.has(`${segment.track}:${segment.seq}`)) {
            reject(new Error("ack lost"));
          } else {
            resolve();
          }
        },
        fail: reject,
      });
    });
  }

  async status() {
    this.statusCalls += 1;
    if (!this.up) throw new Error("no network");
    return { received: { a: [...this.received.a], v: [...this.received.v] } };
  }

  async progress(): Promise<void> {
    this.progressCalls += 1;
    if (!this.up) throw new Error("no network");
  }
}

const POWER: PowerState = {
  batteryLevel: 0.9,
  capacityWh: 15.4,
  secondsRemaining: 3600,
  signal: 0.7,
};

/** Runs `seconds` of an event, calling `plan` before each tick. */
async function runEvent(
  seconds: number,
  plan: (t: number, link: FakeLink) => void = () => {},
) {
  const store = new FakeStore();
  const link = new FakeLink();
  let now = 0;
  const engine = new CaptureEngine({
    store,
    transport: link,
    clock: () => now,
    options: { liveWindowSec: LIVE_WINDOW, offlineAfterSec: 4, reconcileAfterRecoverySec: 2 },
  });

  const ticks = [];
  for (let t = 0; t < seconds; t += 1) {
    now = t;
    plan(t, link);
    link.newTick();
    if (t % SEG_SEC === 0) store.capture(t, engine.rung.index);
    ticks.push(await engine.tick(POWER));
    // Let the fire-and-forget deliveries settle, as they would between frames.
    await Promise.resolve();
    await Promise.resolve();
  }
  return { store, link, engine, ticks };
}

// -------------------------------------------------------- the core claim --

test("on a clean link everything arrives and the ladder stays high", async () => {
  const { store, link, ticks } = await runEvent(120);
  assert.equal(store.pending().length, 0, "the queue did not drain on a good link");
  assert.ok(link.received.a.size >= 59, `only ${link.received.a.size} audio segments arrived`);
  assert.ok(ticks[ticks.length - 1].rung.index <= 1, `ended at ${ticks[ticks.length - 1].rung.name}`);
});

test("THE GUARANTEE: a ten-minute outage delays content, it does not lose it", async () => {
  // This is the claim the company is built on. If this test fails, the product
  // is a video call with extra steps.
  const { store, link } = await runEvent(900, (t, l) => {
    l.up = !(t >= 200 && t < 800);
  });
  assert.equal(store.pending().length, 0, `${store.pending().length} segments never arrived`);

  const expectedSeqs = Math.floor(900 / SEG_SEC);
  assert.ok(
    link.received.a.size >= expectedSeqs - 1,
    `audio: ${link.received.a.size} of ${expectedSeqs} — the archive has a hole`,
  );
});

test("the ladder falls to buffered during the outage and recovers after it", async () => {
  const { ticks } = await runEvent(600, (t, l) => {
    l.up = !(t >= 120 && t < 300);
  });
  const during = ticks[280];
  const after = ticks[560];
  assert.equal(during.rung.index, BUFFERED_RUNG, `during the outage: ${during.rung.name}`);
  assert.equal(during.online, false);
  assert.ok(after.rung.index <= 2, `never recovered: ${after.rung.name}`);
  assert.equal(after.online, true);
});

test("the status line during an outage promises nothing is lost", async () => {
  const { ticks } = await runEvent(200, (t, l) => {
    l.up = t < 100;
  });
  const offline = ticks[150];
  assert.equal(offline.status.tone, "offline");
  assert.match(offline.status.label, /vous ne perdez rien/);
});

test("a slow link drops the picture but never the sound", async () => {
  const { link, ticks } = await runEvent(400, (_t, l) => {
    l.capacityBytes = 4_000; // enough for audio, nowhere near video
  });
  const audioSeqs = Math.floor(400 / SEG_SEC);
  assert.ok(
    link.received.a.size >= audioSeqs - 2,
    `audio floor breached: ${link.received.a.size} of ${audioSeqs}`,
  );
  const end = ticks[ticks.length - 1];
  assert.ok(end.rung.index >= FLOOR_RUNG - 1, `stayed at ${end.rung.name} on a 32 kbps link`);
});

test("backfill drains once the event's live demand stops", async () => {
  // The queue built during the outage must clear when the link returns, which
  // only happens if backfill is not gated by the rung. This is the bug the
  // founder found in the web client.
  const { store, ticks } = await runEvent(700, (t, l) => {
    l.up = !(t >= 100 && t < 400);
  });
  assert.equal(store.pending().length, 0);
  const afterRecovery = ticks.slice(400);
  assert.ok(
    afterRecovery.some((tick) => tick.sent.some((s) => s.track === "v" && s.capturedAt < 400)),
    "backfill video was never sent — the queue could not drain",
  );
});

// ------------------------------------------------------------ reconciling --

test("the client reconciles once after the link returns, not on every tick", async () => {
  const { link } = await runEvent(400, (t, l) => {
    l.up = !(t >= 50 && t < 200);
  });
  assert.ok(link.statusCalls >= 1, "never reconciled after the outage");
  assert.ok(link.statusCalls <= 3, `reconciled ${link.statusCalls} times — this is a chatty client`);
});

test("an ambiguous upload is not re-sent forever", async () => {
  // The server got the bytes; the acknowledgement did not come back. Without
  // reconciliation the client retries this segment for the rest of the event.
  const store = new FakeStore();
  const link = new FakeLink();
  link.ackLost.add("a:0");
  let now = 0;
  const engine = new CaptureEngine({
    store,
    transport: link,
    clock: () => now,
    options: { liveWindowSec: LIVE_WINDOW, offlineAfterSec: 4, reconcileAfterRecoverySec: 2 },
  });

  for (let t = 0; t < 60; t += 1) {
    now = t;
    link.newTick();
    if (t % SEG_SEC === 0) store.capture(t, engine.rung.index);
    await engine.tick(POWER);
    await Promise.resolve();
    await Promise.resolve();
  }

  assert.ok(link.received.a.has(0), "the server should hold the segment");
  assert.equal(
    store.pending().some((s) => s.track === "a" && s.seq === 0),
    false,
    "the client is still trying to re-send a segment the server already has",
  );
});

test("a failed reconciliation is retried rather than abandoned", async () => {
  const { link } = await runEvent(500, (t, l) => {
    // Down, briefly up (so reconciliation is scheduled), down again, then up.
    l.up = !(t >= 50 && t < 150) && !(t >= 160 && t < 260);
  });
  assert.ok(link.statusCalls >= 1, "gave up reconciling after the first failure");
});

// ----------------------------------------------------------------- power --

test("a dying battery caps quality before the battery caps the event", async () => {
  const store = new FakeStore();
  const link = new FakeLink();
  let now = 0;
  const engine = new CaptureEngine({
    store,
    transport: link,
    clock: () => now,
    options: { liveWindowSec: LIVE_WINDOW },
  });

  const dying: PowerState = {
    batteryLevel: 0.18,
    capacityWh: 15.4,
    secondsRemaining: 3 * 3600,
    signal: 0.35,
  };

  let last;
  for (let t = 0; t < 30; t += 1) {
    now = t;
    link.newTick();
    if (t % SEG_SEC === 0) store.capture(t, engine.rung.index);
    last = await engine.tick(dying);
    await Promise.resolve();
  }

  assert.ok(last, "no tick ran");
  assert.equal(last.screenOn, false, "the preview should go before the picture does");
  assert.ok(last.rung.index >= 2, `a fast link overrode the power budget: ${last.rung.name}`);
});

test("telemetry failure never takes down the capture", async () => {
  const store = new FakeStore();
  const link = new FakeLink();
  link.progress = async () => {
    throw new Error("telemetry endpoint down");
  };
  let now = 0;
  const engine = new CaptureEngine({
    store,
    transport: link,
    clock: () => now,
    options: { liveWindowSec: LIVE_WINDOW },
  });

  for (let t = 0; t < 40; t += 1) {
    now = t;
    link.newTick();
    if (t % SEG_SEC === 0) store.capture(t, engine.rung.index);
    await engine.tick(POWER);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(store.pending().length, 0, "a broken heartbeat stopped the upload");
});

test("a segment is never handed to the transport twice at once", async () => {
  const store = new FakeStore();
  const inFlight = new Set<string>();
  let doubled = false;
  const link = new FakeLink();
  const slow: EngineTransport = {
    async send(seg) {
      const id = `${seg.track}:${seg.seq}`;
      if (inFlight.has(id)) doubled = true;
      inFlight.add(id);
      await new Promise((r) => setTimeout(r, 1));
      inFlight.delete(id);
      await link.send(seg);
    },
    status: () => link.status(),
    progress: (u) => link.progress(u),
  };

  let now = 0;
  const engine = new CaptureEngine({
    store,
    transport: slow,
    clock: () => now,
    options: { liveWindowSec: LIVE_WINDOW },
  });
  for (let t = 0; t < 20; t += 1) {
    now = t;
    link.newTick();
    if (t % SEG_SEC === 0) store.capture(t, engine.rung.index);
    await engine.tick(POWER);
  }
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(doubled, false, "the same segment was uploaded twice concurrently");
});
