import assert from "node:assert/strict";
import { test } from "node:test";

import { BUFFERED_RUNG, FLOOR_RUNG, LADDER, RUNG_LABEL_FR, rung } from "../src/ladder.ts";
import { LadderController } from "../src/controller.ts";
import { advise, drawWatts, hoursRemaining } from "../src/power.ts";
import {
  eligible,
  liveBacklogSec,
  missing,
  pendingBytes,
  sendOrder,
  type PendingSegment,
} from "../src/segments.ts";
import { statusLine } from "../src/status.ts";

const LIVE_WINDOW = 15;

// ------------------------------------------------------------------ ladder --

test("the ladder descends monotonically in bitrate", () => {
  for (let i = 1; i < LADDER.length; i += 1) {
    assert.ok(
      LADDER[i].totalKbps <= LADDER[i - 1].totalKbps,
      `rung ${i} (${LADDER[i].name}) is not below rung ${i - 1}`,
    );
  }
});

test("no rung is more than 2x the next — a hole strands the controller", () => {
  // The prototype shipped with a 250 -> 120 kbps gap. Pointe-Noire's 3G sat in
  // it: too slow for 240p, and dropping to audio-only threw away picture the
  // link could carry. Adding 180p12 took live video from 46% to 98%.
  for (let i = 1; i < FLOOR_RUNG; i += 1) {
    const ratio = LADDER[i - 1].totalKbps / LADDER[i].totalKbps;
    assert.ok(ratio <= 2.0, `${LADDER[i - 1].name} -> ${LADDER[i].name} is a ${ratio.toFixed(2)}x drop`);
  }
});

test("the floor carries audio and the buffered rung carries nothing", () => {
  assert.equal(LADDER[FLOOR_RUNG].hasVideo, false);
  assert.equal(LADDER[FLOOR_RUNG].audioKbps, 24);
  assert.equal(LADDER[BUFFERED_RUNG].hasVideo, false);
});

test("every rung has a French label", () => {
  assert.equal(RUNG_LABEL_FR.length, LADDER.length);
  for (const label of RUNG_LABEL_FR) assert.ok(label.length > 0);
});

test("rung() clamps instead of returning undefined", () => {
  assert.equal(rung(-5).index, 0);
  assert.equal(rung(999).index, BUFFERED_RUNG);
});

// -------------------------------------------------------------- controller --

function steady(c: LadderController, kbps: number, ticks: number, powerCapIndex = 0) {
  let last = c.rung;
  for (let i = 0; i < ticks; i += 1) {
    last = c.update({
      deliveredKbps: kbps,
      queueLimited: kbps >= c.rung.totalKbps,
      liveBacklogSec: 0,
      powerCapIndex,
    });
  }
  return last;
}

test("the controller does not collapse on the first tick", () => {
  // It shipped starting its estimate at zero, so tick 0 looked like a dead link
  // and every session began at the audio floor.
  const c = new LadderController(LIVE_WINDOW);
  const r = c.update({ deliveredKbps: 0, queueLimited: false, liveBacklogSec: 0, powerCapIndex: 0 });
  assert.ok(r.index < FLOOR_RUNG, `warmup dropped to ${r.name}`);
});

test("a fast link climbs to the top rung", () => {
  const c = new LadderController(LIVE_WINDOW);
  const r = steady(c, 3000, 30);
  assert.equal(r.index, 0);
});

test("REGRESSION: the ladder leaves the buffered rung once the link returns", () => {
  // The bug the founder found in ten minutes: untick "cut the network" and the
  // client stayed at the buffered rung for the rest of the event.
  const c = new LadderController(LIVE_WINDOW);
  steady(c, 2000, 20);

  // Outage: nothing delivered, live backlog piles up past panic.
  for (let i = 0; i < 30; i += 1) {
    c.update({ deliveredKbps: 0, queueLimited: false, liveBacklogSec: 30, powerCapIndex: 0 });
  }
  assert.equal(c.rungIndex, BUFFERED_RUNG, "should have fallen to buffered during the outage");

  // Link back. The live edge is fresh again; the old backlog is backfill.
  for (let i = 0; i < 40; i += 1) {
    c.update({ deliveredKbps: 1800, queueLimited: true, liveBacklogSec: 0, powerCapIndex: 0 });
  }
  assert.ok(
    c.rungIndex <= 2,
    `stuck at ${c.rung.name} after recovery — this is the shipped bug returning`,
  );
});

test("REGRESSION: the audio floor can still discover the link recovered", () => {
  // At 24 kbps offered, delivered is 24 kbps forever. A controller that treats
  // that as a measurement never climbs out. Queue-limited samples are a lower
  // bound, so it must probe upward.
  const c = new LadderController(LIVE_WINDOW);
  for (let i = 0; i < 20; i += 1) {
    c.update({ deliveredKbps: 20, queueLimited: false, liveBacklogSec: 12, powerCapIndex: 0 });
  }
  assert.ok(c.rungIndex >= FLOOR_RUNG - 1, "should be at or near the floor");

  const before = c.estimate;
  for (let i = 0; i < 40; i += 1) {
    c.update({ deliveredKbps: 24, queueLimited: true, liveBacklogSec: 0, powerCapIndex: 0 });
  }
  assert.ok(c.estimate > before * 2, `estimate stuck at ${c.estimate.toFixed(0)} kbps`);
  assert.ok(c.rungIndex < FLOOR_RUNG, `never left the floor: ${c.rung.name}`);
});

test("an outage freezes the estimate rather than decaying it", () => {
  const c = new LadderController(LIVE_WINDOW);
  steady(c, 2000, 20);
  const before = c.estimate;
  for (let i = 0; i < 60; i += 1) {
    c.update({ deliveredKbps: 0, queueLimited: false, liveBacklogSec: 40, powerCapIndex: 0 });
  }
  assert.ok(c.estimate >= Math.min(before, LADDER[FLOOR_RUNG].totalKbps), "estimate decayed to zero");
});

test("queue thresholds scale with the live window, not with seconds", () => {
  // A 4-second panic threshold inside a 15-second live window means the ladder
  // downgrades while everything is still on time.
  const short = new LadderController(6);
  const long = new LadderController(30);
  const input = { deliveredKbps: 900, queueLimited: false, liveBacklogSec: 8, powerCapIndex: 0 };
  for (let i = 0; i < 10; i += 1) {
    short.update(input);
    long.update(input);
  }
  assert.ok(short.rungIndex > long.rungIndex, "the short window should panic first");
});

test("the power cap applies during warmup", () => {
  const c = new LadderController(LIVE_WINDOW);
  const r = c.update({
    deliveredKbps: 5000,
    queueLimited: true,
    liveBacklogSec: 0,
    powerCapIndex: 4,
  });
  assert.ok(r.index >= 4, `warmup ignored the power cap: ${r.name}`);
});

test("bandwidth never overrides the power cap", () => {
  const c = new LadderController(LIVE_WINDOW);
  const r = steady(c, 5000, 40, 3);
  assert.ok(r.index >= 3, `climbed past the power cap to ${r.name}`);
});

// ------------------------------------------------------------------- power --

test("power draw is monotonic down the ladder", () => {
  // It was not: "photo call" drew more than 180p12 because the model held the
  // camera open continuously for both. Stills duty-cycle the sensor.
  for (let i = 1; i < LADDER.length; i += 1) {
    const hi = drawWatts(LADDER[i - 1], 0.7, true);
    const lo = drawWatts(LADDER[i], 0.7, true);
    assert.ok(lo <= hi, `${LADDER[i].name} (${lo.toFixed(2)} W) draws more than ${LADDER[i - 1].name}`);
  }
});

test("weak signal costs more energy for the same bytes", () => {
  const strong = drawWatts(LADDER[1], 0.9, true);
  const weak = drawWatts(LADDER[1], 0.2, true);
  assert.ok(weak > strong * 1.2, "transmit power should rise sharply as signal falls");
});

test("a healthy battery over a short event permits the top rung", () => {
  const advice = advise({
    batteryLevel: 0.95,
    capacityWh: 15.4,
    secondsRemaining: 45 * 60,
    signal: 0.8,
  });
  assert.equal(advice.capIndex, 0);
  assert.equal(advice.screenOn, true);
  assert.equal(advice.infeasible, false);
});

test("the preview is sacrificed before the picture", () => {
  const advice = advise({
    batteryLevel: 0.3,
    capacityWh: 15.4,
    secondsRemaining: 3 * 3600,
    signal: 0.5,
  });
  assert.equal(advice.screenOn, false, "should turn the screen off first");
  assert.ok(advice.capIndex < FLOOR_RUNG, `dropped to ${LADDER[advice.capIndex].name} with the screen still on`);
});

test("an impossible budget says so, with the screen off", () => {
  const advice = advise({
    batteryLevel: 0.04,
    capacityWh: 15.4,
    secondsRemaining: 6 * 3600,
    signal: 0.2,
  });
  assert.equal(advice.infeasible, true);
  assert.equal(advice.screenOn, false, "the emergency path must not leave the screen on");
});

test("a power bank rescues an impossible budget", () => {
  const state = {
    batteryLevel: 0.1,
    capacityWh: 15.4,
    secondsRemaining: 4 * 3600,
    signal: 0.4,
  };
  const without = advise(state);
  const withBank = advise({ ...state, powerBankWh: 37 });
  assert.ok(withBank.capIndex <= without.capIndex, "the power bank should permit equal or better quality");
  assert.equal(withBank.infeasible, false);
});

test("hoursRemaining falls as quality rises", () => {
  const state = { batteryLevel: 0.6, capacityWh: 15.4, secondsRemaining: 3600, signal: 0.6 };
  assert.ok(hoursRemaining(state, LADDER[0], true) < hoursRemaining(state, LADDER[FLOOR_RUNG], false));
});

test("a full battery and no time left is not a division by zero", () => {
  const advice = advise({ batteryLevel: 1, capacityWh: 15.4, secondsRemaining: 0, signal: 0.9 });
  assert.ok(Number.isFinite(advice.projectedWatts));
  assert.equal(advice.capIndex, 0);
});

// ---------------------------------------------------------------- segments --

function seg(over: Partial<PendingSegment> & { seq: number; track: "a" | "v" }): PendingSegment {
  return { capturedAt: over.seq * 2, bytes: 40_000, rung: 1, ...over };
}

test("live audio outranks everything", () => {
  const now = 100;
  const pending = [
    seg({ seq: 10, track: "v", capturedAt: 98 }),
    seg({ seq: 1, track: "a", capturedAt: 20 }),
    seg({ seq: 10, track: "a", capturedAt: 98 }),
    seg({ seq: 1, track: "v", capturedAt: 20 }),
  ];
  const order = sendOrder(pending, now, LIVE_WINDOW, LADDER[1]);
  assert.deepEqual(
    order.map((s) => `${s.track}${s.seq}`),
    ["a10", "v10", "a1", "v1"],
  );
});

test("REGRESSION: backfill video is not gated by the rung", () => {
  // The shipped browser bug. At the buffered rung the client stopped sending
  // *all* video, including the backlog that caused the downgrade — so the queue
  // could never drain and the session never recovered.
  const now = 300;
  const old = seg({ seq: 5, track: "v", capturedAt: 60 });
  const fresh = seg({ seq: 150, track: "v", capturedAt: 298 });

  assert.equal(eligible(old, now, LIVE_WINDOW, LADDER[FLOOR_RUNG]), true, "backfill video must flow at the audio floor");
  assert.equal(eligible(fresh, now, LIVE_WINDOW, LADDER[FLOOR_RUNG]), false, "live video must not");
});

test("REGRESSION: the buffered rung does not stop the client trying", () => {
  // The obvious rule — "we think the link is down, so send nothing" —
  // deadlocks. The only way to discover the link came back is to try sending,
  // so a client that stops trying stays offline for the rest of the event no
  // matter what the network does. The engine simulation reproduced exactly that
  // when this function was first written the obvious way.
  //
  // Volume, not permission, is what the buffered rung changes: the engine
  // throttles to one probe per tick. That is asserted in engine.test.ts.
  const now = 300;
  const buffered = LADDER[BUFFERED_RUNG];
  assert.equal(eligible(seg({ seq: 148, track: "a", capturedAt: 298 }), now, LIVE_WINDOW, buffered), true);
  assert.equal(eligible(seg({ seq: 5, track: "v", capturedAt: 60 }), now, LIVE_WINDOW, buffered), true);
  // Live video is still withheld — there is no encoder output to send.
  assert.equal(eligible(seg({ seq: 149, track: "v", capturedAt: 299 }), now, LIVE_WINDOW, buffered), false);
  assert.ok(sendOrder([seg({ seq: 1, track: "a" })], now, LIVE_WINDOW, buffered).length > 0);
});

test("REGRESSION: backlog is measured at the live edge only", () => {
  // Measuring across all pending content reports a huge backlog forever after
  // an outage, which pins the ladder at the buffered rung.
  const now = 600;
  const pending = [
    seg({ seq: 1, track: "v", capturedAt: 30 }), // ten minutes of backfill
    seg({ seq: 2, track: "v", capturedAt: 45 }),
    seg({ seq: 299, track: "a", capturedAt: 598 }), // the live edge, healthy
  ];
  assert.equal(liveBacklogSec(pending, now, LIVE_WINDOW), 2);
});

test("an empty live edge reports no backlog", () => {
  assert.equal(liveBacklogSec([], 100, LIVE_WINDOW), 0);
  assert.equal(liveBacklogSec([seg({ seq: 1, track: "a", capturedAt: 2 })], 100, LIVE_WINDOW), 0);
});

test("segments never reorder within a track", () => {
  // The player appends in sequence order; a hole stalls it. Two segments
  // captured in the same second must still leave in sequence order.
  const now = 100;
  const pending = [
    seg({ seq: 9, track: "v", capturedAt: 99 }),
    seg({ seq: 8, track: "v", capturedAt: 99 }),
    seg({ seq: 7, track: "v", capturedAt: 99 }),
  ];
  const order = sendOrder(pending, now, LIVE_WINDOW, LADDER[0]);
  assert.deepEqual(order.map((s) => s.seq), [7, 8, 9]);
});

test("reconciliation re-sends only the difference", () => {
  const local = [
    seg({ seq: 1, track: "a" }),
    seg({ seq: 2, track: "a" }),
    seg({ seq: 3, track: "a" }),
    seg({ seq: 1, track: "v" }),
    seg({ seq: 2, track: "v" }),
  ];
  const out = missing(local, { a: [1, 3], v: [1] });
  assert.deepEqual(
    out.map((s) => `${s.track}${s.seq}`),
    ["a2", "v2"],
  );
});

test("reconciliation against an empty server re-sends everything", () => {
  const local = [seg({ seq: 1, track: "a" }), seg({ seq: 1, track: "v" })];
  assert.equal(missing(local, { a: [], v: [] }).length, 2);
});

test("pendingBytes totals the queue", () => {
  assert.equal(pendingBytes([seg({ seq: 1, track: "a", bytes: 10 }), seg({ seq: 2, track: "a", bytes: 32 })]), 42);
  assert.equal(pendingBytes([]), 0);
});

// ------------------------------------------------------------------ status --

const T = {
  rung: 1,
  batteryPct: 80,
  uplinkKbps: 900,
  backlogSec: 1,
  screenOn: true,
};

test("the buffered rung promises nothing is lost", () => {
  const s = statusLine({ ...T, rung: BUFFERED_RUNG, backlogSec: 42 }, "live");
  assert.equal(s.tone, "offline");
  assert.match(s.label, /vous ne perdez rien/);
  assert.match(s.detail ?? "", /42/);
});

test("the audio floor explains that video is coming later", () => {
  const s = statusLine({ ...T, rung: FLOOR_RUNG }, "live");
  assert.equal(s.tone, "degraded");
  assert.match(s.label, /audio seul/);
  assert.match(s.detail ?? "", /rien n'est perdu/);
});

test("a screen turned off by the power budget says why", () => {
  const s = statusLine({ ...T, rung: 3, screenOn: false }, "live");
  assert.match(s.label, /économie d'énergie/);
  assert.match(s.detail ?? "", /jusqu'à la fin/);
});

test("a good link is not apologised for", () => {
  const s = statusLine({ ...T, rung: 0 }, "live");
  assert.equal(s.tone, "good");
  assert.match(s.label, /Bonne connexion/);
});

test("a finished recording says complete, not 'live'", () => {
  assert.equal(statusLine(T, "complete").tone, "good");
  assert.equal(statusLine(T, "ended").tone, "buffering");
});

test("no telemetry never produces a bare spinner", () => {
  const s = statusLine(null, "live");
  assert.ok(s.label.length > 0);
  assert.equal(s.tone, "buffering");
});

test("every rung produces a label with no undefined in it", () => {
  for (let i = 0; i < LADDER.length; i += 1) {
    for (const screenOn of [true, false]) {
      const s = statusLine({ ...T, rung: i, screenOn }, "live");
      assert.ok(!s.label.includes("undefined"), `rung ${i} produced "${s.label}"`);
      assert.ok(s.label.length > 0);
    }
  }
});

test("battery is omitted rather than printed as null", () => {
  const s = statusLine({ ...T, rung: FLOOR_RUNG, batteryPct: null }, "live");
  assert.ok(!s.label.includes("null"), s.label);
  assert.ok(!s.label.includes("batterie"), s.label);
});
