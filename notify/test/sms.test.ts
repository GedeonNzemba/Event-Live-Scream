import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Outbox } from "../src/outbox.ts";
import {
  androidGateway,
  asOutboxDriver,
  africasTalking,
  dryRunSms,
  fallbackChain,
  toPlainSms,
  webhookGateway,
  type SmsDriver,
} from "../src/sms.ts";

/** A driver that records what it was asked to send. */
function spy(ok = true, error?: string): SmsDriver & { sent: Array<{ to: string; body: string }> } {
  const sent: Array<{ to: string; body: string }> = [];
  return {
    name: ok ? "spy-ok" : "spy-fail",
    sent,
    async send(to, body) {
      sent.push({ to, body });
      return ok ? { ok: true } : { ok: false, error: error ?? "nope" };
    },
  };
}

describe("SMS is not WhatsApp", () => {
  it("strips markup that would arrive as literal asterisks", () => {
    assert.equal(toPlainSms("Bonjour, *Mariage de Grace* commence."), "Bonjour, Mariage de Grace commence.");
  });

  it("collapses the blank lines a template uses for breathing room", () => {
    // Every 160 characters is another segment, and every segment costs.
    const whatsapp = "Ligne un.\n\n\nLigne deux.\n\nLigne trois.";
    assert.equal(toPlainSms(whatsapp), "Ligne un.\nLigne deux.\nLigne trois.");
  });

  it("keeps a mission offer inside two segments", () => {
    const out = new Outbox(dryRunSms(() => {}));
    out.enqueue({
      to: "05 551 22 33",
      country: "CG",
      template: "gig_offer",
      params: ["Merveille", "samedi 14 mars", "14h00", "Makélékélé", "20 000 XAF"],
      idempotencyKey: "sms-len",
    });
    const body = toPlainSms(out.all[0].body);
    assert.ok(body.length <= 320, `${body.length} characters is more than two segments`);
  });
});

describe("the free gateway", () => {
  it("posts the shape android-sms-gateway expects", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 202 });
    }) as typeof fetch;

    try {
      const driver = androidGateway({
        baseUrl: "http://192.168.1.42:8080",
        username: "sms",
        password: "secret",
        simNumber: 2,
      });
      const result = await driver.send("+242055512233", "Bonjour Merveille");
      assert.equal(result.ok, true);

      assert.equal(calls[0].url, "http://192.168.1.42:8080/message");
      const body = JSON.parse(String(calls[0].init.body));
      assert.deepEqual(body.phoneNumbers, ["+242055512233"]);
      assert.equal(body.message, "Bonjour Merveille");
      assert.equal(body.simNumber, 2, "dual-SIM handsets need to be told which SIM");

      const headers = calls[0].init.headers as Record<string, string>;
      assert.match(headers.authorization, /^Basic /);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reports a flat or absent phone rather than pretending it sent", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    try {
      const result = await androidGateway({
        baseUrl: "http://192.168.1.42:8080",
        username: "u",
        password: "p",
      }).send("+242055512233", "test");
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /unreachable/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("drives anything that accepts {to, message}", async () => {
    let seen: unknown = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      seen = JSON.parse(String(init.body));
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    try {
      await webhookGateway("http://localhost:9000/send", "tok").send("+242055512233", "hi");
      assert.deepEqual(seen, { to: "+242055512233", message: "hi" });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("the paid gateway", () => {
  it("treats a per-recipient rejection as a failure, not a success", async () => {
    // Africa's Talking returns 200 with the real outcome inside the body. A
    // driver that only checks the status code silently loses messages.
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          SMSMessageData: { Recipients: [{ status: "UserInBlacklist", statusCode: 406 }] },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const result = await africasTalking({ username: "u", apiKey: "k" }).send("+242055512233", "hi");
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /UserInBlacklist/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("accepts a genuine success", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ SMSMessageData: { Recipients: [{ status: "Success", statusCode: 101 }] } }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const result = await africasTalking({ username: "u", apiKey: "k" }).send("+242055512233", "hi");
      assert.equal(result.ok, true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("falling back", () => {
  it("uses the free route when it works and never touches the paid one", async () => {
    const free = spy(true);
    const paid = spy(true);
    const result = await fallbackChain(free, paid).send("+242055512233", "hi");
    assert.equal(result.ok, true);
    assert.equal(free.sent.length, 1);
    assert.equal(paid.sent.length, 0, "should not have paid for a message the phone sent");
  });

  it("falls through to the paid route when the phone is flat", async () => {
    // The whole point: a dead phone in Brazzaville becomes a small bill rather
    // than a correspondent who never learns they have a mission.
    const free = spy(false, "gateway unreachable");
    const paid = spy(true);
    const result = await fallbackChain(free, paid).send("+242055512233", "hi");
    assert.equal(result.ok, true);
    assert.equal(paid.sent.length, 1);
  });

  it("reports every route that failed, so the cause is visible", async () => {
    const result = await fallbackChain(spy(false, "phone off"), spy(false, "no credit")).send("+1", "hi");
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /phone off/);
    assert.match(result.error ?? "", /no credit/);
  });
});

describe("SMS through the outbox", () => {
  it("sends a rendered template as plain text", async () => {
    const driver = spy(true);
    const out = new Outbox(asOutboxDriver(driver));
    out.enqueue({
      to: "05 551 22 33",
      country: "CG",
      template: "gig_reminder",
      params: ["14h00", "Makélékélé"],
      idempotencyKey: "sms-1",
    });
    await out.flush();

    assert.equal(driver.sent.length, 1);
    assert.equal(driver.sent[0].to, "+242055512233");
    assert.ok(!driver.sent[0].body.includes("*"), "markup reached the handset");
    assert.match(driver.sent[0].body, /14h00/);
  });

  it("still refuses duplicates and still expires stale messages", async () => {
    const driver = spy(true);
    const out = new Outbox(asOutboxDriver(driver));
    const common = {
      to: "05 551 22 33",
      country: "CG" as const,
      template: "gig_reminder" as const,
      params: ["14h00", "Makélékélé"],
    };
    out.enqueue({ ...common, idempotencyKey: "same" });
    out.enqueue({ ...common, idempotencyKey: "same" });
    out.enqueue({ ...common, idempotencyKey: "stale", ttlSec: -1 });
    await out.flush();

    assert.equal(driver.sent.length, 1, "duplicate or expired message reached the handset");
    assert.equal(out.byStatus("dropped").length, 1);
  });
});
