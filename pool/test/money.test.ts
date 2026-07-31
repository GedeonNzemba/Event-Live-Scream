import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { add, bps, eur, fmt, splitEvenly, suggestedShare, toMajor } from "../src/money.ts";

describe("money never loses a cent", () => {
  it("splits exactly, with no rounding drift", () => {
    // The case that motivates integer minor units: 89 / 9 has no exact binary
    // floating-point representation, and nine naive shares sum to 89.00000000000001.
    for (const total of [eur(89), eur(39), eur(250), eur(0.03), eur(1000.01)]) {
      for (let n = 1; n <= 20; n++) {
        const shares = splitEvenly(total, n);
        assert.equal(shares.length, n);
        assert.equal(add(...shares), total, `${fmt(total)} across ${n} did not sum back`);
      }
    }
  });

  it("spreads the remainder one cent at a time, never more", () => {
    const shares = splitEvenly(eur(89), 9);
    assert.equal(add(...shares), eur(89));
    const spread = Math.max(...shares) - Math.min(...shares);
    assert.ok(spread <= 1, `shares differ by ${spread} cents; nobody should pay 2c more`);
    assert.equal(shares.filter((s) => s === 989).length, 8);
    assert.equal(shares.filter((s) => s === 988).length, 1);
  });

  it("suggests a share that always covers the target when everyone pays it", () => {
    // The UI shows one number to everybody. If it rounds down, a fully-funded
    // pool lands a cent short and never closes.
    for (const total of [eur(89), eur(39), eur(250), eur(17.77)]) {
      for (let n = 1; n <= 20; n++) {
        const each = suggestedShare(total, n);
        assert.ok(each * n >= total, `${n} x ${fmt(each)} falls short of ${fmt(total)}`);
      }
    }
  });

  it("rejects splitting across nobody", () => {
    assert.throws(() => splitEvenly(eur(10), 0), RangeError);
  });

  it("rounds basis points half-up to the cent", () => {
    assert.equal(bps(eur(10), 150), 15); // 1.50% of €10.00 = €0.15
    assert.equal(bps(eur(89), 150), 134); // €1.335 -> €1.34
    assert.equal(bps(eur(100), 0), 0);
  });

  it("formats readably, including thousands and negatives", () => {
    assert.equal(fmt(eur(9.89)), "€9.89");
    assert.equal(fmt(eur(0.05)), "€0.05");
    assert.equal(fmt(eur(30000)), "€30 000.00");
    assert.equal(fmt(-eur(4.93)), "-€4.93");
  });

  it("round-trips through major units", () => {
    assert.equal(toMajor(eur(89)), 89);
    assert.equal(toMajor(eur(9.89)), 9.89);
  });
});
