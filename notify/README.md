# Notifications

WhatsApp message templates, delivery drivers and an outbox — the channel every other part of
this product reaches families through.

```bash
npm run demo   # a whole wedding, every message, with the running cost
npm test       # 19 tests
```

## Why WhatsApp, and why only for messages

[docs/02](../docs/02-solution.md): Congolese families already live in WhatsApp — it is where
funerals get organised and money gets collected — so fighting that is how this company dies.
Booking, invitations, reminders and the viewing link all travel through it.

The *video* never does, for the reasons in [docs/09](../docs/09-platforms-and-clients.md).
WhatsApp is the front door, not the venue.

## What it does

| Piece | File |
| --- | --- |
| The eleven message templates, in French | `src/templates.ts` |
| E.164 normalisation for the shapes humans type | `src/phone.ts` |
| Outbox: dedupe, retry, expiry, spend tracking | `src/outbox.ts` |
| Drivers: dry-run, flaky (for tests), Meta Cloud API | `src/drivers.ts` |

`npm run demo` prints the entire journey — booking, contributions, the gig offer to
Merveille, both reminders, the start-now message, the network-cut warning, the delivery
notice and the payout — so **the wording can be reviewed by somebody who actually talks to
these families, without reading any code.**

## What it costs, which is not what people expect

One wedding, ten messages, across France and Congo: **€0.31**.

At 50 presences a month that is about €16; at 300, about €93. The reason it is so cheap is
that Meta made *service* conversations free when the customer messages first — and in this
business they always do, because booking begins with them sending a message. We pay only for
the proactive nudges.

Every template is therefore marked `utility` (we pay) or `service` (free, and only valid
inside the 24-hour window). Sending a service template outside that window fails silently at
Meta, so the outbox **refuses it rather than believing it went**.

## Three decisions worth knowing

**Deduplication before anything else.** The interesting failures in a messaging system are
duplicates and silence, not errors. Every message carries an idempotency key; a repeat is
refused. Two clicks on "share" must not become two messages to a grieving family.

**Time-critical messages expire rather than arrive late.** *"The ceremony is starting"*
delivered thirty minutes after it ended is worse than silence — it tells a family they missed
something. Those messages carry a TTL and are dropped, not retried forever.

**A missing token falls back to dry-run rather than throwing.** At three in the morning
during somebody's funeral, printing to a console beats crashing.

## Can SMS be free? Mostly yes, and here is the honest arithmetic

You asked whether the paid gateway is really necessary. Short answer: **for the volume this
product actually needs, no — and both free routes are implemented in `src/sms.ts`.**

### First, how little SMS is needed

The diaspora never gets an SMS. They get push notifications, which cost nothing. Once a
correspondent installs the app, they get push too. SMS is needed in exactly two places:

1. Recruiting a correspondent who has installed nothing yet.
2. **Fallback when push does not arrive** — and this is not hypothetical here. Tecno, Infinix
   and Xiaomi ship battery managers that routinely kill FCM delivery, and those are precisely
   the phones correspondents own.

That is a handful of messages per correspondent per month. **At 300 presences the entire SMS
bill is single-digit euros either way.** This is not where the money is — but it is where a
hard vendor dependency would be, and removing that is worth doing.

### The routes, assessed

| Route | Verdict | Why |
| --- | --- | --- |
| **Email-to-SMS** (`number@carrier.tld`) | ❌ Dead end | A North American convention that is being switched off — Verizon has already gone. **No published gateway exists for MTN Congo or Airtel Congo.** |
| **[android-sms-gateway](https://github.com/capcom6/android-sms-gateway)** | ✅ Viable, low volume | Apache-2.0, actively maintained. A spare Android with a local SIM becomes an HTTP API. Implemented as `androidGateway()` |
| **Gammu-SMSD + USB modem** | ✅ Sturdier version | No Android throttle, built for this. A Huawei E3372 is ~€25. Drive it through `webhookGateway()` pointed at a thin shim |
| **[Africa's Talking](https://africastalking.com)** | 💶 ~€0.01–0.02 | Covers Congo-Brazzaville. Buys delivery receipts, a registered sender ID, and infrastructure |

### The limits that matter

**Android throttles outgoing SMS at 30 per 30 minutes** by default. Fine for tens of messages
a day; not a platform. android-sms-gateway's own README says it is "not recommended for batch
sending due to potential mobile operator restrictions" — believe it.

**A consumer SIM cannot have an alphanumeric sender ID.** Messages arrive from an unknown
number rather than from `ELONGO`, which matters when you are asking someone to accept a paid
mission. Congo's regulator (ARPCE) expects registered sender IDs for A2P traffic — worth
checking before scaling this route.

### The catch nobody mentions

Both free routes need a device that stays **powered and connected in Brazzaville**.

This company exists *because* mains power and connectivity are unreliable there. Running your
own SMS infrastructure on the exact two things you built a product to work around is a real
risk, not a clever saving.

### What to actually do

```
Phase 0–1   android-sms-gateway on a spare Android with a Congolese SIM.
            Nearly free, no vendor account, nothing to wait for approval on.

Phase 2+    fallbackChain(androidGateway(...), africasTalking(...))
            The free route first; a flat phone in Brazzaville degrades into a
            small bill rather than a correspondent who never hears about a job.

Always      Push first. SMS only when push failed or the app is not installed.
```

`fallbackChain()` implements exactly that, and is tested to confirm the paid route is never
touched while the free one works.

### One bug this exercise caught

Writing the SMS tests found that **Congo-Brazzaville keeps its leading zero** in international
format — national mobile numbers are nine digits beginning `05`/`06`, and the international
form is `+242` plus all nine. France drops its trunk zero; Congo does not. The normaliser was
stripping it, producing a number one digit short that no carrier would route. **Every
correspondent SMS would have silently gone nowhere.** Fixed, and now tested in both directions.

## If Meta will not give you API access

Signup is closed in many countries, and it blocks nothing. Sharing a pool link into a family
group is the OS share sheet — free, universal, no API. Proactive messages move to **push
notifications** once the native apps exist ([docs/12](../docs/12-mobile-apps.md)), and
correspondents in Congo are reachable by **SMS via
[Africa's Talking](https://africastalking.com/sms/bulksms)**, which covers Congo-Brazzaville
at roughly €0.01–0.02 a message and is far cheaper than Twilio there.

If you want WhatsApp later, go through a **Business Solution Provider** — 360dialog, Gupshup,
Infobip, or Arkesel for Africa — rather than Meta directly. The templates in
`src/templates.ts` are already in the shape a BSP will ask for, and the driver interface in
`src/drivers.ts` takes a new implementation without touching anything else.

## Going live

Nothing here has touched the real Meta API — there are no credentials in this repository, and
faking the endpoint would prove nothing. The request shape follows Meta's documented template
format and **must be verified against a real account before anyone relies on it.**

To switch over:

1. Meta Business account, a verified WhatsApp sender number, and the Cloud API app.
2. Submit all eleven templates for approval. This takes days, not minutes — do it early.
3. Set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`; `driverFromEnv()` switches
   automatically.

Go **direct to Meta**, not through Twilio or 360dialog. They add a per-message markup for
onboarding convenience that is not worth paying once the templates exist
([docs/10](../docs/10-stack-and-costs.md)).

## Not built

- **Inbound messages.** Merveille replying `OUI` to accept a mission needs a webhook receiver
  and Meta's signature verification.
- **Persistence.** The outbox is in memory; a restart forgets what it sent, which would break
  deduplication across process boundaries. Postgres, alongside everything else.
- **Scheduling.** Reminders are enqueued by the caller; nothing here decides when.
- **Opt-out.** Required by Meta policy and not yet wired.
