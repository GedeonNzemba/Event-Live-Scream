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
