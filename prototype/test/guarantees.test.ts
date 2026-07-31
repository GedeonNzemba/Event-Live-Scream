import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PROFILES, getProfile } from "../src/link/profiles.ts";
import { runSession } from "../src/session.ts";
import type { SessionConfig } from "../src/types.ts";

/**
 * These are the promises the business makes, written as assertions.
 *
 * The refund policy in docs/05-operations.md says: if we do not deliver the
 * complete recording, the customer does not pay. That promise is only safe to
 * make because of the store-and-forward design, and this file is where we check
 * it still holds.
 */

function config(over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    name: "test",
    durationSec: 3 * 3600,
    drainSec: 6 * 3600,
    batteryStartPct: 55,
    batteryCapacityWh: 15.4,
    liveWindowSec: 15,
    seed: 20260731,
    ...over,
  };
}

describe("the recording always arrives", () => {
  for (const profile of Object.values(PROFILES)) {
    it(`delivers 100% of the archive over ${profile.id}`, () => {
      const result = runSession(config(), profile);
      assert.equal(
        result.store.completeness(),
        1,
        `archive incomplete on ${profile.id}: ${(result.store.completeness() * 100).toFixed(2)}%`,
      );
    });
  }

  it("delivers the archive even when the link dies for twenty minutes", () => {
    const profile = getProfile("wedding-worst-case");
    const result = runSession(config(), profile);

    assert.ok(result.outageSeconds > 1200, "expected a substantial blackout in this profile");

    // Everything captured during the blackout must still reach the server.
    const duringOutage = result.store.all.filter(
      (s) => s.capturedAt >= 5400 && s.capturedAt < 6600,
    );
    assert.ok(duringOutage.length > 0, "expected content captured during the blackout");
    assert.ok(
      duringOutage.every((s) => s.deliveredAt !== null),
      "content captured during the blackout was lost",
    );
  });

  it("keeps capturing while the network is gone", () => {
    const profile = getProfile("rural-edge");
    const result = runSession(config(), profile);
    // Capture is independent of the network: one audio segment per second, always.
    assert.equal(result.store.capturedCount("audio"), result.capturedSeconds);
  });
});

describe("audio is the payload", () => {
  it("prioritises audio over video when bandwidth is scarce", () => {
    const profile = getProfile("rural-edge");
    const cfg = config();
    const result = runSession(cfg, profile);

    const heard = result.store.livePresence("audio", cfg.liveWindowSec, cfg.durationSec);
    const seen = result.store.livePresence("video", cfg.liveWindowSec, cfg.durationSec);

    assert.ok(
      heard > seen,
      `audio should survive better than video on a starved link (heard ${heard}, saw ${seen})`,
    );
    assert.ok(heard > 0.9, `audio continuity collapsed on EDGE: ${heard}`);
  });

  it("never drops the audio track from the archive", () => {
    for (const profile of Object.values(PROFILES)) {
      const result = runSession(config(), profile);
      assert.equal(result.store.completeness("audio"), 1, `audio archive incomplete on ${profile.id}`);
    }
  });
});

describe("the ladder adapts rather than giving up", () => {
  it("uses the range of the ladder instead of pinning to one rung", () => {
    const result = runSession(config(), getProfile("wedding-worst-case"));
    const used = result.rungSeconds.filter((s) => s > 0).length;
    assert.ok(used >= 4, `expected the ladder to move across rungs, used only ${used}`);
  });

  it("recovers quality after a total outage instead of staying at the floor", () => {
    const cfg = config();
    const result = runSession(cfg, getProfile("wedding-worst-case"));

    // The blackout runs 5400-6600. Look at the twenty minutes after it clears.
    const after = result.ticks.filter((t) => t.t >= 6700 && t.t < 7900);
    assert.ok(after.length > 0, "expected ticks after the blackout");
    const recovered = after.filter((t) => t.rung <= 3).length / after.length;
    assert.ok(
      recovered > 0.5,
      `ladder failed to recover after the outage: only ${(recovered * 100).toFixed(0)}% of the following 20 min above 240p`,
    );
  });

  it("does not degrade while the send queue is still inside the live window", () => {
    // A queue shallower than the alarm threshold is healthy, not congestion.
    const cfg = config({ seed: 7 });
    const result = runSession(cfg, getProfile("brazzaville-4g"));
    const shallowButDegraded = result.ticks.filter(
      (t) => t.queueDepthSec <= 2 && t.rung >= 5 && t.linkKbps > 600,
    );
    assert.equal(
      shallowButDegraded.length,
      0,
      `degraded ${shallowButDegraded.length} times despite a healthy queue and a good link`,
    );
  });
});

describe("power is budgeted to the end of the event", () => {
  it("reaches the booked end on a half-charged phone", () => {
    for (const profile of Object.values(PROFILES)) {
      const result = runSession(config({ batteryStartPct: 55 }), profile);
      assert.ok(result.reachedEnd, `battery died before the end on ${profile.id}`);
    }
  });

  it("reaches the end of a four-hour ceremony on a phone at 35%", () => {
    const result = runSession(
      config({ batteryStartPct: 35, durationSec: 4 * 3600 }),
      getProfile("brazzaville-evening"),
    );
    assert.ok(result.reachedEnd, "failed to reach the end of a 4h event at 35% battery");
    assert.equal(result.store.completeness(), 1, "archive incomplete");
  });

  it("the kit's power bank turns an impossible booking into a routine one", () => {
    // Sylvain's actual problem, stated as physics: the grid failed yesterday,
    // the phone is at 20%, and the ceremony runs four hours. 20% of a 15.4 Wh
    // battery is 3.1 Wh; the floor draws ~0.97 W; so the handset alone cannot
    // do it at any quality, and no amount of clever encoding changes that.
    const bare = runSession(
      config({ batteryStartPct: 20, durationSec: 4 * 3600 }),
      getProfile("brazzaville-evening"),
    );
    assert.equal(bare.reachedEnd, false, "expected a 20% phone to die inside 4 hours");

    // The 20,000 mAh pack in the correspondent kit is ~74 Wh nominal, ~52 Wh
    // delivered after conversion losses. This is the whole reason it is in the
    // kit, and it is worth checking that €18 buys what docs/05 says it buys.
    const equipped = runSession(
      config({ batteryStartPct: 20, durationSec: 4 * 3600, powerBankWh: 52 }),
      getProfile("brazzaville-evening"),
    );
    assert.ok(equipped.reachedEnd, "power bank failed to carry a 4h event");
    assert.equal(equipped.store.completeness(), 1, "archive incomplete");
    // The precise claim is not "the picture is good" — on an evening-peak cell
    // the link caps quality at 240p whatever the battery holds. It is that
    // power stops being the binding constraint at all, leaving the network as
    // the only thing deciding quality.
    const powerLimited =
      equipped.ticks.filter((t) => t.powerCap > 0).length / equipped.ticks.length;
    assert.ok(
      powerLimited < 0.05,
      `power still constrained quality for ${(powerLimited * 100).toFixed(0)}% of the event`,
    );
  });

  it("degrades gracefully when the battery genuinely cannot last", () => {
    // When physics wins, everything captured before the phone died must still
    // reach the family. A short complete recording beats a long lost one.
    const result = runSession(
      config({ batteryStartPct: 12, durationSec: 4 * 3600 }),
      getProfile("brazzaville-evening"),
    );
    assert.equal(result.reachedEnd, false);
    assert.ok(result.capturedSeconds > 600, "should have captured what it could");
    assert.equal(
      result.store.completeness(),
      1,
      "content captured before the battery died was lost",
    );
  });

  it("sacrifices the preview screen before it sacrifices picture quality", () => {
    const result = runSession(
      config({ batteryStartPct: 30, durationSec: 4 * 3600 }),
      getProfile("brazzaville-4g"),
    );
    assert.ok(
      result.screenOffSeconds > 0,
      "expected the preview screen to be disabled under a tight power budget",
    );
  });

  it("never selects a rung the power budget forbids", () => {
    const result = runSession(
      config({ batteryStartPct: 20, durationSec: 4 * 3600 }),
      getProfile("brazzaville-4g"),
    );
    const violations = result.ticks.filter((t) => t.rung < t.powerCap);
    assert.equal(violations.length, 0, `${violations.length} ticks exceeded the power cap`);
  });
});

describe("the simulation is reproducible", () => {
  it("produces identical results for the same seed", () => {
    const a = runSession(config({ seed: 42 }), getProfile("pointe-noire-3g"));
    const b = runSession(config({ seed: 42 }), getProfile("pointe-noire-3g"));
    assert.deepEqual(a.rungSeconds, b.rungSeconds);
    assert.equal(a.batteryEndPct, b.batteryEndPct);
  });

  it("produces different results for different seeds", () => {
    const a = runSession(config({ seed: 1 }), getProfile("pointe-noire-3g"));
    const b = runSession(config({ seed: 2 }), getProfile("pointe-noire-3g"));
    assert.notDeepEqual(a.rungSeconds, b.rungSeconds);
  });
});
