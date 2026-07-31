import { normalise, type Country } from "./phone.ts";
import { render, TEMPLATES, type TemplateName } from "./templates.ts";

/**
 * The outbox.
 *
 * Sending is separated from deciding-to-send for the reason every messaging
 * system eventually learns: the interesting failures are duplicates and
 * silence, not errors. A retry that re-sends "the ceremony is starting" twenty
 * minutes late, to a family who already watched it, is worse than not sending.
 *
 * So: every message carries an idempotency key, retries are bounded and
 * backed off, and anything that cannot be delivered before it stops being true
 * is dropped rather than delivered late.
 */

export type SendStatus = "queued" | "sent" | "failed" | "dropped" | "skipped";

export type Message = {
  readonly id: string;
  /** Same key twice means the same message; the second is skipped. */
  readonly idempotencyKey: string;
  readonly to: string;
  readonly templateName: TemplateName;
  readonly params: readonly string[];
  readonly body: string;
  status: SendStatus;
  attempts: number;
  lastError: string | null;
  /**
   * After this moment the message is no longer worth sending. "Starting now"
   * has a short life; "your recording is ready" has a long one.
   */
  readonly expiresAtMs: number | null;
  readonly queuedAtMs: number;
  sentAtMs: number | null;
  /** Estimated cost in euro cents. Zero for free service conversations. */
  readonly costCents: number;
};

export type Driver = {
  readonly name: string;
  send(message: Message): Promise<{ ok: boolean; error?: string }>;
};

/**
 * Rough per-message cost for a utility template.
 *
 * Meta prices by destination country and the rate moves; verify before relying
 * on it (docs/10). Service conversations are genuinely free, and in this
 * business that covers the whole conversational surface because booking always
 * starts with the customer.
 */
const UTILITY_COST_CENTS: Record<string, number> = {
  "+33": 4, // France
  "+32": 4, // Belgium
  "+44": 4, // UK
  "+1": 2, // US / Canada
  "+242": 1, // Congo
  default: 4,
};

function costFor(e164: string, category: string): number {
  if (category === "service") return 0;
  const prefix = Object.keys(UTILITY_COST_CENTS)
    .filter((p) => p !== "default" && e164.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return UTILITY_COST_CENTS[prefix ?? "default"];
}

export type EnqueueInput = {
  readonly to: string;
  readonly country?: Country;
  readonly template: TemplateName;
  readonly params: readonly string[];
  readonly idempotencyKey: string;
  /** Seconds after which the message stops being worth sending. */
  readonly ttlSec?: number;
  /**
   * True when the customer messaged us within the last 24 hours, which makes
   * this a free service reply rather than a paid template.
   */
  readonly inServiceWindow?: boolean;
};

export class Outbox {
  private readonly driver: Driver;
  private readonly messages: Message[] = [];
  private readonly seen = new Set<string>();
  private counter = 0;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  get all(): readonly Message[] {
    return this.messages;
  }

  get spentCents(): number {
    return this.messages.filter((m) => m.status === "sent").reduce((n, m) => n + m.costCents, 0);
  }

  byStatus(status: SendStatus): Message[] {
    return this.messages.filter((m) => m.status === status);
  }

  enqueue(input: EnqueueInput): Message | null {
    // Deduplicate before doing anything else. Two clicks on "share" must not
    // become two messages.
    if (this.seen.has(input.idempotencyKey)) return null;

    const phone = normalise(input.to, input.country ?? "FR");
    const spec = TEMPLATES[input.template];

    const message: Message = {
      id: `m${++this.counter}`,
      idempotencyKey: input.idempotencyKey,
      to: phone.ok ? phone.e164 : input.to,
      templateName: input.template,
      params: input.params,
      body: render(input.template, input.params),
      status: "queued",
      attempts: 0,
      lastError: null,
      expiresAtMs: input.ttlSec ? Date.now() + input.ttlSec * 1000 : null,
      queuedAtMs: Date.now(),
      sentAtMs: null,
      costCents: phone.ok
        ? costFor(phone.e164, input.inServiceWindow ? "service" : spec.category)
        : 0,
    };

    this.seen.add(input.idempotencyKey);

    if (!phone.ok) {
      message.status = "failed";
      message.lastError = `unusable number: ${phone.reason}`;
    } else if (spec.category === "service" && !input.inServiceWindow) {
      // Meta drops these silently outside the 24-hour window. Refusing here is
      // better than believing we sent something we did not.
      message.status = "skipped";
      message.lastError = "service template outside the 24-hour window";
    }

    this.messages.push(message);
    return message;
  }

  /** Attempts every queued message once. Returns how many were sent. */
  async flush(maxAttempts = 3): Promise<number> {
    let sent = 0;
    for (const message of this.messages) {
      if (message.status !== "queued") continue;

      if (message.expiresAtMs !== null && Date.now() > message.expiresAtMs) {
        // "The ceremony is starting" delivered after it ended is worse than
        // silence: it tells a family they missed something.
        message.status = "dropped";
        message.lastError = "expired before it could be delivered";
        continue;
      }

      message.attempts += 1;
      const result = await this.driver.send(message);
      if (result.ok) {
        message.status = "sent";
        message.sentAtMs = Date.now();
        sent += 1;
      } else {
        message.lastError = result.error ?? "unknown error";
        if (message.attempts >= maxAttempts) message.status = "failed";
      }
    }
    return sent;
  }
}
