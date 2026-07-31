import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { growth, requiredK } from "../src/growth.ts";
import { eur } from "../src/money.ts";
import { FamilyPool, type PoolConfig } from "../src/pool.ts";
import { equivalentSingleCharge, feeFor, feeRatio, RAILS } from "../src/rails.ts";
import { buildPool, getScenario } from "../src/scenarios.ts";

const base: PoolConfig = {
  reference: "test",
  eventName: "Test event",
  target: eur(89),
  bookerName: "Sylvain",
  bookerCountry: "FR",
  expectedParticipants: 9,
};

describe("the pool collects money correctly", () => {
  it("tracks progress toward the target", () => {
    const p = new FamilyPool(base);
    assert.equal(p.raised, 0);
    assert.equal(p.remaining, eur(89));
    assert.equal(p.status, "open");

    p.contribute("Sylvain", "FR", eur(15), { firstTime: false });
    p.contribute("Bernadette", "BE", eur(10));
    assert.equal(p.raised, eur(25));
    assert.equal(p.remaining, eur(64));
    assert.equal(p.status, "open");
  });

  it("flips to funded when the target is reached", () => {
    const p = new FamilyPool(base);
    p.contribute("Sylvain", "FR", eur(50), { firstTime: false });
    assert.equal(p.status, "open");
    p.contribute("Bernadette", "BE", eur(39));
    assert.equal(p.status, "funded");
    assert.equal(p.remaining, 0);
    assert.ok(p.isFunded);
  });

  it("refuses contributions below the minimum", () => {
    // Not meanness: at €2 the processor takes 14%, which is a share of a gift
    // to a family that nobody would agree to if it were shown to them.
    const p = new FamilyPool(base);
    assert.throws(() => p.contribute("Someone", "FR", eur(2)), RangeError);
    assert.doesNotThrow(() => p.contribute("Someone", "FR", eur(5)));
  });

  it("refuses contributions past the overfunding ceiling", () => {
    const p = new FamilyPool(base);
    assert.throws(() => p.contribute("Generous", "FR", eur(200)), RangeError);
  });

  it("refuses contributions once closed", () => {
    const p = new FamilyPool(base);
    p.contribute("Sylvain", "FR", eur(89), { firstTime: false });
    p.closeAtDeadline();
    assert.throws(() => p.contribute("Late", "FR", eur(10)), /closed/);
  });
});

describe("an underfunded pool is never a cancelled event", () => {
  it("charges the shortfall to the booker at the deadline", () => {
    const p = new FamilyPool(base);
    p.contribute("Sylvain", "FR", eur(15), { firstTime: false });
    p.contribute("Bernadette", "BE", eur(10));

    const close = p.closeAtDeadline();

    assert.equal(close.funded, false);
    assert.equal(close.shortfall, eur(64));
    assert.equal(close.shortfallChargedToBooker, eur(64));
    // The event is confirmed and fully paid for; nobody's wedding is cancelled
    // because the seventh cousin did not pay.
    assert.equal(p.status, "confirmed");
    assert.equal(p.raised, eur(89));
    assert.equal(p.remaining, 0);
  });

  it("marks the shortfall charge so it is never counted as a new customer", () => {
    const p = new FamilyPool(base);
    p.contribute("Sylvain", "FR", eur(15), { firstTime: false });
    p.closeAtDeadline();
    const charge = p.all.at(-1);
    assert.ok(charge);
    assert.equal(charge.isShortfallCharge, true);
    assert.equal(charge.firstTime, false);
    assert.equal(p.firstTimers, 0);
  });

  it("does not charge anything when the pool filled up", () => {
    const p = new FamilyPool(base);
    p.contribute("Sylvain", "FR", eur(89), { firstTime: false });
    const close = p.closeAtDeadline();
    assert.equal(close.funded, true);
    assert.equal(close.shortfallChargedToBooker, 0);
    assert.equal(p.payerCount, 1);
  });
});

describe("surplus becomes family credit, not profit and not a refund", () => {
  it("banks the overfunding from a funeral", () => {
    const p = buildPool(getScenario("matanga"));
    const close = p.closeAtDeadline();
    assert.ok(p.raised > eur(250), "expected this scenario to overfund");
    assert.equal(close.surplus, p.raised - eur(250));
    assert.equal(close.familyCredit, close.surplus);
  });
});

describe("refunds cost real money", () => {
  it("does not recover processing fees on a refund", () => {
    const p = buildPool(getScenario("wedding"));
    const feesPaid = p.processingFees;
    const r = p.refundAll("failed");

    assert.equal(r.refunded, eur(90));
    assert.equal(r.unrecoverableFees, feesPaid);
    assert.ok(r.unrecoverableFees > 0, "a failed delivery is a loss, not a wash");
    assert.equal(p.status, "failed");
  });
});

describe("state transitions", () => {
  it("cannot deliver a pool that was never closed", () => {
    const p = new FamilyPool(base);
    p.contribute("Sylvain", "FR", eur(89), { firstTime: false });
    assert.throws(() => p.markDelivered(), /cannot deliver/);
  });

  it("runs the happy path end to end", () => {
    const p = buildPool(getScenario("wedding"));
    assert.equal(p.status, "funded");
    p.closeAtDeadline();
    assert.equal(p.status, "confirmed");
    p.markDelivered();
    assert.equal(p.status, "delivered");
  });
});

describe("fees behave the way the pricing assumes", () => {
  it("makes small contributions disproportionately expensive", () => {
    const card = RAILS.card_eea;
    const small = feeRatio(card, eur(2), false);
    const large = feeRatio(card, eur(89), false);
    assert.ok(small > 0.1, `€2 should lose over 10% to fees, got ${small}`);
    assert.ok(large < 0.02, `€89 should lose under 2%, got ${large}`);
    assert.ok(small > large * 5, "the fixed fee should dominate at small amounts");
  });

  it("caps SEPA fees, so large single payments are much cheaper by bank debit", () => {
    const sepa = RAILS.sepa_debit;
    const big = feeFor(sepa, eur(2000), false);
    assert.equal(big, eur(6), "SEPA fee should hit its cap");
    assert.ok(big < feeFor(RAILS.card_eea, eur(2000), false));
  });

  it("charges more for non-EEA cards than EEA cards", () => {
    const amount = eur(10);
    assert.ok(
      feeFor(RAILS.card_intl, amount, true) > feeFor(RAILS.card_eea, amount, false),
      "a contribution from Montréal costs more to accept than one from Paris",
    );
  });

  it("costs nothing marginal to contribute from a pre-funded balance", () => {
    assert.equal(feeFor(RAILS.wallet, eur(10), false), 0);
  });

  it("reports the equivalent single charge consistently", () => {
    // Round-tripping: a charge that nets X should, when its fee is subtracted,
    // give back X. This is what makes the "≡ one payer" column trustworthy.
    const rail = RAILS.card_eea;
    for (const net of [eur(50), eur(85.07), eur(256.33)]) {
      const charge = equivalentSingleCharge(net, rail, false);
      const recovered = charge - feeFor(rail, charge, false);
      assert.ok(Math.abs(recovered - net) <= 1, `off by ${recovered - net} cents`);
    }
  });
});

describe("the growth model behaves sensibly", () => {
  it("gives no amplification when nobody activates", () => {
    const g = growth({ poolSize: 9, newFraction: 0.75, activationRate: 0, paidCac: eur(20), ltv: eur(140) });
    assert.equal(g.k, 0);
    assert.equal(g.amplification, 1);
    assert.equal(g.blendedCac, eur(20), "with no virality, blended CAC is just paid CAC");
  });

  it("cuts blended CAC as the viral coefficient rises", () => {
    const mk = (activationRate: number) =>
      growth({ poolSize: 9, newFraction: 0.75, activationRate, paidCac: eur(20), ltv: eur(140) });
    assert.ok(mk(0.1).blendedCac < mk(0.05).blendedCac);
    assert.ok(mk(0.15).ltvCacRatio > mk(0.05).ltvCacRatio);
  });

  it("flags self-sustaining growth at K >= 1", () => {
    const g = growth({ poolSize: 20, newFraction: 1, activationRate: 0.2, paidCac: eur(20), ltv: eur(140) });
    assert.ok(g.selfSustaining);
    assert.equal(g.amplification, Infinity);
  });

  it("inverts to the K a target CAC requires", () => {
    // docs/03 claims a blended CAC around €11.50 against ~€20 paid.
    const k = requiredK(eur(20), eur(11.5));
    assert.ok(k > 0.4 && k < 0.46, `expected K around 0.43, got ${k}`);

    // And that claim must be reachable at a realistic pool size.
    const g = growth({ poolSize: 9, newFraction: 0.75, activationRate: 0.072, paidCac: eur(20), ltv: eur(140) });
    assert.ok(Math.abs(g.k - k) < 0.05, "docs/03 needs roughly 7% activation at a pool of nine");
  });

  it("a solo booking has no viral value at all", () => {
    const g = growth({ poolSize: 1, newFraction: 1, activationRate: 0.5, paidCac: eur(20), ltv: eur(140) });
    assert.equal(g.k, 0, "one payer exposes nobody; this is why the pool is the growth engine");
  });
});
