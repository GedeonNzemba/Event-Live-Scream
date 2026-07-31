import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dryRun, flaky } from "../src/drivers.ts";
import { Outbox } from "../src/outbox.ts";
import { mask, normalise } from "../src/phone.ts";
import { render, TEMPLATES } from "../src/templates.ts";

const silent = () => dryRun(() => {});

describe("phone numbers", () => {
  it("normalises the shapes a French relative actually types", () => {
    for (const input of ["0612345678", "06 12 34 56 78", "06.12.34.56.78", "+33612345678", "0033612345678"]) {
      const r = normalise(input, "FR");
      assert.equal(r.ok && r.e164, "+33612345678", `failed on "${input}"`);
    }
  });

  it("keeps the leading zero on a Brazzaville number", () => {
    // Congo national mobile numbers are nine digits beginning 05 or 06, and the
    // international form keeps all nine — unlike France, which drops the trunk
    // zero. Stripping it yields a number no carrier will route.
    for (const input of ["05 551 22 33", "055512233", "+242055512233", "00242055512233"]) {
      const r = normalise(input, "CG");
      assert.equal(r.ok && r.e164, "+242055512233", `failed on "${input}"`);
    }
  });

  it("still drops the trunk zero where the country expects it", () => {
    assert.equal(normalise("06 12 34 56 78", "FR").ok && normalise("06 12 34 56 78", "FR").e164, "+33612345678");
  });

  it("keeps an international number that already has its prefix", () => {
    const r = normalise("+442071234567", "FR");
    assert.equal(r.ok && r.e164, "+442071234567");
  });

  it("rejects rubbish rather than sending into the void", () => {
    for (const bad of ["", "   ", "abc", "12"]) {
      assert.equal(normalise(bad, "FR").ok, false, `accepted "${bad}"`);
    }
  });

  it("masks numbers for display", () => {
    assert.equal(mask("+33612345678"), "+3361…678");
  });
});

describe("templates", () => {
  it("fills every placeholder", () => {
    const body = render("event_starting", ["Mariage de Grace", "https://elongo.cg/v/X"]);
    assert.match(body, /Mariage de Grace/);
    assert.match(body, /https:\/\/elongo\.cg\/v\/X/);
    assert.ok(!body.includes("{{"), "an unfilled placeholder reached the message");
  });

  it("refuses the wrong number of parameters", () => {
    assert.throws(() => render("event_starting", ["only one"]), RangeError);
  });

  it("declares a parameter name for every placeholder it uses", () => {
    // A template whose {{3}} has no documented meaning is one somebody will
    // eventually fill with the wrong value.
    for (const [name, t] of Object.entries(TEMPLATES)) {
      const used = new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
      assert.equal(used.size, t.params.length, `${name}: placeholders and params disagree`);
      for (const i of used) {
        assert.ok(i >= 1 && i <= t.params.length, `${name}: {{${i}}} is out of range`);
      }
    }
  });

  it("never leaves a template uncategorised for billing", () => {
    for (const [name, t] of Object.entries(TEMPLATES)) {
      assert.ok(["utility", "service", "marketing"].includes(t.category), `${name} has no category`);
      assert.ok(t.purpose.length > 20, `${name} does not explain why it exists`);
    }
  });
});

describe("the outbox", () => {
  it("sends a queued message", async () => {
    const out = new Outbox(silent());
    out.enqueue({
      to: "0612345678",
      country: "FR",
      template: "pool_funded",
      params: ["Mariage", "9"],
      idempotencyKey: "k1",
    });
    assert.equal(await out.flush(), 1);
    assert.equal(out.byStatus("sent").length, 1);
  });

  it("refuses a duplicate rather than messaging a family twice", async () => {
    const out = new Outbox(silent());
    const first = out.enqueue({
      to: "0612345678", country: "FR", template: "pool_funded",
      params: ["Mariage", "9"], idempotencyKey: "same",
    });
    const second = out.enqueue({
      to: "0612345678", country: "FR", template: "pool_funded",
      params: ["Mariage", "9"], idempotencyKey: "same",
    });
    assert.ok(first);
    assert.equal(second, null);
    assert.equal(out.all.length, 1);
  });

  it("fails a message to an unusable number instead of pretending", async () => {
    const out = new Outbox(silent());
    const m = out.enqueue({
      to: "not-a-number", country: "FR", template: "pool_funded",
      params: ["Mariage", "9"], idempotencyKey: "bad",
    });
    assert.equal(m?.status, "failed");
    assert.match(m?.lastError ?? "", /unusable number/);
  });

  it("drops a time-critical message rather than delivering it late", async () => {
    // "The ceremony is starting" arriving after it ended is worse than silence:
    // it tells a family they missed something.
    const out = new Outbox(silent());
    out.enqueue({
      to: "0612345678", country: "FR", template: "event_starting",
      params: ["Mariage", "https://x"], idempotencyKey: "late", ttlSec: -1,
    });
    await out.flush();
    const m = out.all[0];
    assert.equal(m.status, "dropped");
    assert.match(m.lastError ?? "", /expired/);
  });

  it("retries a transient failure, then gives up", async () => {
    const out = new Outbox({ name: "always-fails", async send() { return { ok: false, error: "boom" }; } });
    out.enqueue({
      to: "0612345678", country: "FR", template: "pool_funded",
      params: ["Mariage", "9"], idempotencyKey: "retry",
    });
    await out.flush(3);
    await out.flush(3);
    await out.flush(3);
    const m = out.all[0];
    assert.equal(m.status, "failed");
    assert.equal(m.attempts, 3);
  });

  it("eventually delivers through a flaky network", async () => {
    const out = new Outbox(flaky(0.6, 7));
    for (let i = 0; i < 10; i++) {
      out.enqueue({
        to: "0612345678", country: "FR", template: "pool_funded",
        params: ["Mariage", "9"], idempotencyKey: `f${i}`,
      });
    }
    for (let pass = 0; pass < 6; pass++) await out.flush(6);
    assert.ok(out.byStatus("sent").length >= 8, `${out.byStatus("sent").length} of 10 got through`);
  });
});

describe("what it costs", () => {
  it("charges nothing for a reply inside the service window", async () => {
    const out = new Outbox(silent());
    out.enqueue({
      to: "0612345678", country: "FR", template: "pool_funded",
      params: ["Mariage", "9"], idempotencyKey: "free", inServiceWindow: true,
    });
    await out.flush();
    assert.equal(out.spentCents, 0);
  });

  it("charges for a proactive template", async () => {
    const out = new Outbox(silent());
    out.enqueue({
      to: "0612345678", country: "FR", template: "event_starting",
      params: ["Mariage", "https://x"], idempotencyKey: "paid",
    });
    await out.flush();
    assert.ok(out.spentCents > 0);
  });

  it("costs less to reach Brazzaville than Paris", async () => {
    const fr = new Outbox(silent());
    fr.enqueue({
      to: "0612345678", country: "FR", template: "pool_funded",
      params: ["M", "9"], idempotencyKey: "fr",
    });
    await fr.flush();

    const cg = new Outbox(silent());
    cg.enqueue({
      to: "055512233", country: "CG", template: "gig_reminder",
      params: ["14h", "Makélékélé"], idempotencyKey: "cg",
    });
    await cg.flush();

    assert.ok(cg.spentCents < fr.spentCents, "Congo should be the cheaper destination");
  });

  it("keeps a whole wedding under fifteen cents", async () => {
    // The cost claim in docs/10 rests on this being small.
    const out = new Outbox(silent());
    const journey: Array<[Parameters<typeof out.enqueue>[0]["template"], string[]]> = [
      ["pool_created", ["Sylvain", "Mariage", "89 €", "https://x"]],
      ["pool_contribution", ["Bernadette", "10 €", "Mariage", "64 €"]],
      ["pool_funded", ["Mariage", "9"]],
      ["event_tomorrow", ["Mariage", "14h", "Merveille"]],
      ["event_starting", ["Mariage", "https://x"]],
      ["recording_ready", ["Mariage", "3 h 58", "https://x"]],
    ];

    for (const [index, [name, params]] of journey.entries()) {
      out.enqueue({
        to: "0612345678",
        country: "FR",
        template: name,
        params,
        idempotencyKey: `journey-${index}`,
      });
    }

    await out.flush();
    assert.equal(out.byStatus("sent").length, journey.length);
    assert.ok(out.spentCents <= 30, `${out.spentCents} cents for one event`);
  });
});
