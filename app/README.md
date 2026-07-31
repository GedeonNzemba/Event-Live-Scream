# The booking and family-pool app

A runnable slice of the product: create a booking, get a shareable link, watch relatives
across five countries fill the pool, and run it through to delivery — or to a refund.

**No dependencies, no database, no build step.**

```bash
npm run seed     # three example bookings from pool/src/scenarios.ts
npm start        # http://localhost:3000
npm test         # 23 tests
```

## Why this and not the video app first

[docs/07](../docs/07-roadmap-and-validation.md) ranks the pool first to build, and
[`pool/`](../pool) explains why: splitting a bill across nine relatives is simultaneously the
revenue multiplier and the cheapest customer acquisition available — about **€0.50 per new
relative reached, against roughly €20 to buy one with advertising.**

It is also the only part of the product you can test with real money before any video code
exists. A family either splits the bill or they do not, and you find that out with a link.

## What to click through

Start at `/` and book something, or run `npm run seed` and go to `/ops`.

**The booking form** picks a tier from [docs/02](../docs/02-solution.md) — Appel €15, Fête €39,
Cérémonie €89, Grand Événement €250 — and creates a pool at that price.

**The pool page** is the shareable link, and the thing that actually has to work. It shows
progress, who has paid, a contribution form, and a mock-up of the card WhatsApp renders when
the link lands in a family group. There is a collapsed **Coulisses** panel showing the real
per-contribution fees computed by [`pool/src/rails.ts`](../pool/src/rails.ts) — no customer
would ever see that, but it is the point of building this.

**The ops view** at `/ops` is where the interesting rules live:

- **Clôturer** simulates the day before the event. If the pool is short, the shortfall is
  charged to whoever booked it. **An underfunded pool is never a cancelled event** — cancelling
  a funeral stream because the seventh cousin did not pay would be unrecoverable.
- If the pool overfunded, the surplus becomes credit against the family's next event.
- **Rembourser** exercises the guarantee from [docs/05](../docs/05-operations.md), and reports
  the processing fees that do *not* come back. A failed delivery is a real loss, not a wash.

The seeded birthday deliberately sits short of its target, so the shortfall rule is visible
the moment you press Clôturer.

## Things worth trying

```
Contribute €2                    → refused; below €5 the processor takes over 6%
Contribute after clôture         → refused, with a reason
Deliver before closing           → refused
Name an event  <script>alert(1)  → escaped, not executed
Restart the server               → everything is still there
```

That last one matters more than it looks: closing a pool must not be undone by a restart, and
the booker must not be charged the shortfall twice. There are tests for both.

## How it is put together

```
src/server.ts    routing, form parsing, response headers
src/pages.ts     server-rendered HTML
src/html.ts      escaping — every piece of user input goes through esc()
src/db.ts        JSON file, written atomically
src/tiers.ts     the service tiers and countries
src/seed.ts      loads pool/src/scenarios.ts as real bookings
```

**Every business rule lives in [`../pool`](../pool), where it is already tested.** This package
is transport and HTML over it. When the shortfall rule or the fee model needs to change, it
changes there and both the CLI reports and this app follow.

Storage is a JSON file so that clicking through requires no setup. Postgres is the right
answer for the real thing; this is not the real thing.

The UI is in French because the customers are francophone, and getting that right from the
start is cheaper than retrofitting it.

## Security notes

Small, but the habits should be right from the beginning:

- **Everything user-supplied is escaped** before reaching a page — event names, contributor
  names, places — including inside `<title>` and the Open Graph tags WhatsApp reads. Tested.
- **No filesystem path is built from user input.** Static serving uses an explicit allow-list,
  so no `../` traversal is possible. Tested.
- `Content-Security-Policy`, `X-Content-Type-Options` and `Referrer-Policy` are set on every
  response.
- Request bodies are capped at 64 KB.
- Pool references avoid vowels and lookalike characters (`0/O`, `1/I`, `5/S`, `8/B`), so they
  survive being read aloud over a bad line to Brazzaville and never spell anything.

## What this is not

- **No real payments.** Contributions are simulated; the *fees* are computed by the real model,
  but no card is charged. Stripe comes in phase 1 proper.
- **No accounts, no login.** Anyone with the link can contribute, which is deliberate — friction
  at that moment costs conversion, and the moment is emotionally loaded. The ops view is
  unprotected because this runs on your laptop; it needs auth before it goes anywhere near the
  internet.
- **No video.** That is [`../prototype`](../prototype), and it is a simulation too.
- **No WhatsApp integration.** The card preview is a mock-up of what Meta will render; the real
  thing needs the Cloud API, costed in [docs/10](../docs/10-stack-and-costs.md).
