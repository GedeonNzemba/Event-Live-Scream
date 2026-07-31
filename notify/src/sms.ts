import type { Driver, Message } from "./outbox.ts";
import { mask } from "./phone.ts";

/**
 * SMS, including the genuinely free routes.
 *
 * ── Why SMS at all ────────────────────────────────────────────────────────
 *
 * Almost nowhere. The diaspora gets push notifications, which cost nothing.
 * Correspondents with the app installed get push too. SMS is needed in exactly
 * two places:
 *
 *   1. Recruiting a correspondent who has not installed anything yet.
 *   2. Fallback when push does not arrive — which is not hypothetical in this
 *      market. Tecno, Infinix and Xiaomi ship aggressive battery managers that
 *      routinely kill FCM delivery, and those are the phones correspondents own.
 *
 * That is a handful of messages per correspondent per month. At 300 presences
 * the whole SMS bill is single-digit euros either way, so **this is not where
 * the money is** — but it is where a hard dependency would be, and removing it
 * is worth doing.
 *
 * ── The free routes, honestly assessed ───────────────────────────────────
 *
 * EMAIL-TO-SMS (number@carrier.tld) is a dead end here. Those gateways are a
 * North American convention, they are being switched off (Verizon has already
 * gone), and there is no published gateway for MTN Congo or Airtel Congo. Not
 * viable.
 *
 * ANDROID SMS GATEWAY — github.com/capcom6/android-sms-gateway, Apache-2.0 —
 * turns a spare Android phone with a local SIM into an HTTP SMS API. This is
 * genuinely viable at low volume and is implemented below. Its own README warns
 * against batch sending, and Android throttles outgoing SMS at 30 per 30 minutes
 * by default. Perfectly adequate for tens of messages a day; not a platform.
 *
 * GAMMU-SMSD with a USB GSM modem (a Huawei E3372 is about €25) is the sturdier
 * version of the same idea: no Android throttle, designed for exactly this, runs
 * on any always-on Linux box. It speaks no HTTP of its own, so drive it through
 * the generic `webhookGateway` below pointed at a thin shim.
 *
 * ── The catch nobody mentions ────────────────────────────────────────────
 *
 * Both self-hosted routes need a device that stays powered and connected in
 * Brazzaville. This company exists *because* mains power and connectivity are
 * unreliable there. Running your own SMS infrastructure on the exact two things
 * you built a product to work around is a real risk, not a clever saving.
 *
 * So: self-host in phase 0 and 1, when the saving is real relative to a budget
 * of zero and there is no vendor account to wait for. Move to a paid gateway
 * when SMS starts mattering — you will also want a registered alphanumeric
 * sender ID, which ARPCE (Congo's regulator) expects for A2P traffic and which
 * a consumer SIM cannot provide.
 */

export type SmsDriver = {
  readonly name: string;
  /** @param to E.164, e.g. +242055512233 */
  send(to: string, body: string): Promise<{ ok: boolean; error?: string }>;
};

/**
 * WhatsApp templates use `*bold*` and generous blank lines. An SMS is 160
 * characters a segment and every one costs, so flatten before sending.
 */
export function toPlainSms(body: string): string {
  return body
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ------------------------------------------------------------- free routes --

export type AndroidGatewayConfig = {
  /**
   * Where the phone is reachable. Local mode is `http://<phone-ip>:8080`;
   * cloud mode is `https://api.sms-gate.app/3rdparty/v1`; a private server is
   * whatever you deployed.
   */
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  /** Which SIM to send from, on a dual-SIM handset. */
  readonly simNumber?: number;
};

/**
 * A spare Android phone in Brazzaville, acting as the gateway.
 *
 * Cost: a SIM and a bundle — often a couple of euros a month, and on-net SMS to
 * the same carrier is frequently bundled or free. No vendor account, no
 * approval process, no per-message fee.
 *
 * Keep the volume low. Android's default throttle is 30 messages per 30 minutes
 * and carriers watch consumer SIMs for A2P patterns.
 */
export function androidGateway(config: AndroidGatewayConfig): SmsDriver {
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return {
    name: "android-sms-gateway",
    async send(to, body) {
      try {
        const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/message`, {
          method: "POST",
          headers: {
            authorization: `Basic ${auth}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: body,
            phoneNumbers: [to],
            ...(config.simNumber ? { simNumber: config.simNumber } : {}),
          }),
        });
        if (res.ok) return { ok: true };
        return { ok: false, error: `gateway ${res.status}: ${(await res.text()).slice(0, 160)}` };
      } catch (err) {
        // The usual cause is the phone being asleep, off the network, or flat.
        return { ok: false, error: `gateway unreachable: ${(err as Error).message}` };
      }
    },
  };
}

/**
 * Anything that accepts `POST {to, message}` — a Gammu-SMSD shim, a Kannel
 * instance, an office PBX, a self-hosted script.
 *
 * Deliberately dumb, so a new box does not need a new driver.
 */
export function webhookGateway(url: string, token?: string): SmsDriver {
  return {
    name: "webhook-gateway",
    async send(to, message) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ to, message }),
        });
        return res.ok
          ? { ok: true }
          : { ok: false, error: `webhook ${res.status}` };
      } catch (err) {
        return { ok: false, error: `webhook unreachable: ${(err as Error).message}` };
      }
    },
  };
}

// ------------------------------------------------------------- paid route --

export type AfricasTalkingConfig = {
  readonly username: string;
  readonly apiKey: string;
  /** A registered alphanumeric sender ID. ARPCE expects one for A2P traffic. */
  readonly senderId?: string;
  readonly sandbox?: boolean;
};

/**
 * Africa's Talking — covers Congo-Brazzaville, roughly €0.01–0.02 a message,
 * and materially cheaper than Twilio across the continent.
 *
 * The reason to pay: delivery receipts, a registered sender ID so the message
 * says ELONGO rather than an unknown number, and infrastructure that does not
 * depend on a phone staying charged in Brazzaville.
 */
export function africasTalking(config: AfricasTalkingConfig): SmsDriver {
  const host = config.sandbox
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

  return {
    name: "africas-talking",
    async send(to, message) {
      try {
        const form = new URLSearchParams({
          username: config.username,
          to,
          message,
          ...(config.senderId ? { from: config.senderId } : {}),
        });
        const res = await fetch(`${host}/version1/messaging`, {
          method: "POST",
          headers: {
            apiKey: config.apiKey,
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: form.toString(),
        });
        if (!res.ok) {
          return { ok: false, error: `africastalking ${res.status}: ${(await res.text()).slice(0, 160)}` };
        }
        // A 200 does not mean delivered: per-recipient status lives in the body.
        const body = (await res.json()) as {
          SMSMessageData?: { Recipients?: Array<{ status?: string; statusCode?: number }> };
        };
        const recipient = body.SMSMessageData?.Recipients?.[0];
        if (recipient && recipient.status && !/success/i.test(recipient.status)) {
          return { ok: false, error: `rejected: ${recipient.status}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: `network: ${(err as Error).message}` };
      }
    },
  };
}

// ------------------------------------------------------------------ local --

export function dryRunSms(log: (line: string) => void = console.log): SmsDriver {
  return {
    name: "dry-run-sms",
    async send(to, body) {
      log("");
      log(`  → ${mask(to)}   SMS   [${body.length} chars, ${Math.ceil(body.length / 160)} segment(s)]`);
      for (const line of body.split("\n")) log(`    ${line}`);
      return { ok: true };
    },
  };
}

// ---------------------------------------------------------------- adapter --

/** Lets the Outbox send a rendered template over any SMS driver. */
export function asOutboxDriver(sms: SmsDriver): Driver {
  return {
    name: sms.name,
    async send(message: Message) {
      return sms.send(message.to, toPlainSms(message.body));
    },
  };
}

/**
 * Picks an SMS route from the environment, cheapest first.
 *
 * Falls back to dry-run rather than throwing: a missing credential at three in
 * the morning during a funeral should print to a console, not crash.
 */
export function smsFromEnv(log?: (line: string) => void): SmsDriver {
  if (process.env.SMS_GATEWAY_URL && process.env.SMS_GATEWAY_USER) {
    return androidGateway({
      baseUrl: process.env.SMS_GATEWAY_URL,
      username: process.env.SMS_GATEWAY_USER,
      password: process.env.SMS_GATEWAY_PASSWORD ?? "",
      simNumber: process.env.SMS_GATEWAY_SIM ? Number(process.env.SMS_GATEWAY_SIM) : undefined,
    });
  }
  if (process.env.SMS_WEBHOOK_URL) {
    return webhookGateway(process.env.SMS_WEBHOOK_URL, process.env.SMS_WEBHOOK_TOKEN);
  }
  if (process.env.AT_USERNAME && process.env.AT_API_KEY) {
    return africasTalking({
      username: process.env.AT_USERNAME,
      apiKey: process.env.AT_API_KEY,
      senderId: process.env.AT_SENDER_ID,
      sandbox: process.env.AT_SANDBOX === "true",
    });
  }
  return dryRunSms(log);
}

/**
 * Tries each route in order until one accepts the message.
 *
 * The intended arrangement is the free gateway first and a paid one behind it,
 * so a flat phone in Brazzaville degrades into a small bill rather than a
 * correspondent who never learns they have a mission.
 */
export function fallbackChain(...drivers: SmsDriver[]): SmsDriver {
  return {
    name: `chain(${drivers.map((d) => d.name).join(" → ")})`,
    async send(to, body) {
      const errors: string[] = [];
      for (const driver of drivers) {
        const result = await driver.send(to, body);
        if (result.ok) return { ok: true };
        errors.push(`${driver.name}: ${result.error ?? "failed"}`);
      }
      return { ok: false, error: errors.join(" | ") };
    },
  };
}
