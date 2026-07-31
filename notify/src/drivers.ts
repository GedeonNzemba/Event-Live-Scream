import type { Driver, Message } from "./outbox.ts";
import { TEMPLATES } from "./templates.ts";
import { mask } from "./phone.ts";

/**
 * Delivery drivers.
 *
 * `dryRun` is the default and the one that runs today: it prints what would be
 * sent and costs nothing. `cloudApi` is the real thing and needs credentials
 * the founder does not have yet — a Meta Business account, a verified number,
 * and every template above submitted and approved, which takes days.
 *
 * Keeping both behind one interface means the switch is a single environment
 * variable rather than a rewrite, and the whole flow is exercisable before any
 * of that paperwork exists.
 */

/** Prints instead of sending. Always succeeds. */
export function dryRun(log: (line: string) => void = console.log): Driver {
  return {
    name: "dry-run",
    async send(message: Message) {
      const spec = TEMPLATES[message.templateName];
      log("");
      log(`  → ${mask(message.to)}   ${spec.name}   [${spec.category}]`);
      for (const line of message.body.split("\n")) log(`    ${line}`);
      return { ok: true };
    },
  };
}

/** Fails a proportion of sends, so retry and expiry paths can be tested. */
export function flaky(failRate: number, seed = 1): Driver {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  return {
    name: "flaky",
    async send() {
      return rand() < failRate ? { ok: false, error: "simulated network failure" } : { ok: true };
    },
  };
}

export type CloudApiConfig = {
  /** The phone number ID from the Meta app dashboard, not the number itself. */
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly apiVersion?: string;
};

/**
 * The real Meta Cloud API.
 *
 * Deliberately talks to Meta directly rather than through Twilio or 360dialog:
 * they add a per-message markup for onboarding convenience that is not worth
 * paying once the templates exist (docs/10).
 *
 * Untested against the live API — there are no credentials in this repository
 * and there is no way to fake the endpoint honestly. The request shape follows
 * Meta's documented template message format, and it must be verified against a
 * real account before anyone relies on it.
 */
export function cloudApi(config: CloudApiConfig): Driver {
  const version = config.apiVersion ?? "v21.0";
  const endpoint = `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`;

  return {
    name: "cloud-api",
    async send(message: Message) {
      const spec = TEMPLATES[message.templateName];
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: message.to.replace(/^\+/, ""),
            type: "template",
            template: {
              name: spec.name,
              language: { code: spec.language },
              components: [
                {
                  type: "body",
                  parameters: message.params.map((text) => ({ type: "text", text })),
                },
              ],
            },
          }),
        });

        if (res.ok) return { ok: true };

        const detail = await res.text();
        // 4xx other than rate limiting will not succeed on retry — usually an
        // unapproved template or a number that has not opted in.
        const permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
        return {
          ok: false,
          error: `${permanent ? "permanent" : "transient"} ${res.status}: ${detail.slice(0, 200)}`,
        };
      } catch (err) {
        return { ok: false, error: `network: ${(err as Error).message}` };
      }
    },
  };
}

/**
 * Picks a driver from the environment.
 *
 * Falls back to dry-run, deliberately: a missing token should print messages
 * to a console, not throw at three in the morning during somebody's funeral.
 */
export function driverFromEnv(log?: (line: string) => void): Driver {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (phoneNumberId && accessToken) return cloudApi({ phoneNumberId, accessToken });
  return dryRun(log);
}
