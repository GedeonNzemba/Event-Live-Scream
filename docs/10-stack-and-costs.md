# 10 — Technology stack and what it costs

*What you actually pay, month by month, and what you can safely not pay for yet.*

> **Prices move.** Everything below is a published list rate checked in 2026 and should be
> re-verified before you commit. Where a number materially changes a decision, I have said so.
> Processors and video platforms both discount meaningfully once you have volume — assume the
> list price is the worst case, not the price.

## The principle

From [document 09](./09-platforms-and-clients.md): **own the interface, rent the commodity.**
In cost terms that means paying other people to run video infrastructure while volume is low
and your engineering time is the scarcest thing you have, then bringing it in-house at the
point where the monthly bill exceeds what the engineering would cost. That crossover is
calculated below, and it lands around phase 2.

---

## Phase 0 — the thirty-day validation

You need almost nothing. This is the point.

| Thing | Choice | Cost |
| --- | --- | --- |
| Legal entity | **Micro-entreprise** (auto-entrepreneur) in France | Free, registered online in days |
| Domain | `.cg`, `.com` or `.fr` | €10–15/year |
| Booking | **WhatsApp Business App** — the free phone app, not the API | €0 |
| Streaming | **YouTube, unlisted** | €0 |
| Payments | **Stripe** payment links | No monthly fee. 1.5% + €0.25 per EEA card |
| Spreadsheet | Whatever you already have | €0 |

**Recurring software cost: about €1/month.**

The €300 in [document 07](./07-roadmap-and-validation.md) is correspondent fees, data bundles
and a power bank — not technology. Resist every temptation to buy tooling this month. You are
testing whether ten families will pay, and no software changes that answer.

You do need a legal entity to take money properly. In France a micro-entreprise is free,
fast, and fine up to about €77k of service revenue — comfortably more than phase 0 and 1 will
produce. Upgrade to a SASU when you raise or when you outgrow it.

---

## Phase 1 — minimum viable platform (months 2–6, target 50 presences/month)

Still renting nearly everything. The only thing you build is the booking flow, the family
pool and your own player skin.

| Layer | Choice | Monthly |
| --- | --- | --- |
| Web app + API | **Next.js** on Vercel Pro, or Railway / Fly.io | €20–25 |
| Database | **Postgres** — Supabase Pro or Neon | €20–25 |
| Video hosting | **Cloudflare Stream** — ingest, transcode, delivery, recording | ~€110 |
| Object storage | Cloudflare **R2** (zero egress fees) | €5–15 |
| Messaging | **WhatsApp Cloud API**, direct from Meta | €20–30 |
| Email | Zoho Mail (€1/user) or Google Workspace (€6/user) | €2–12 |
| Payments | Stripe | Transaction fees only |
| Payouts | MTN MoMo / Airtel Money, or an aggregator | ~1.5% of payouts |
| Error tracking | Sentry, free tier | €0 |
| Analytics | PostHog free tier, or Plausible | €0–9 |
| Source control & CI | GitHub, free | €0 |
| **Software total** | | **≈ €200–230** |
| Accountant (France) | Not optional once money moves | €80–200 |

**Realistic all-in: €300–430/month.**

### Two things worth knowing here

**If you cannot get the WhatsApp API at all**, which is the case in many countries, none of
this stalls: sharing works through the share sheet for free, notifications move to push once
the apps exist, and correspondents are reached by SMS via Africa's Talking at roughly
€0.01–0.02 a message. See [document 12](./12-mobile-apps.md).

**WhatsApp is cheaper than people expect.** Meta made service conversations free when the
*customer* messages first — and in our model they always do, because booking starts with them
messaging us. You pay only for proactive template messages: confirmations, the 48-hour and
3-hour reminders, the delivery notice. At roughly €0.04 each and a dozen per presence, fifty
presences is about €24/month. **Use the Cloud API directly from Meta**, not a reseller like
Twilio or 360dialog, which add a markup for convenience you do not need yet.

**Cloudflare Stream is a convenience premium, and it is the right trade in phase 1.** At
$5/1,000 minutes stored and $1/1,000 minutes delivered, fifty three-hour presences watched by
eight relatives each runs about €110/month. Self-hosting the same thing costs perhaps €40 in
compute and near-zero in egress on R2 — but it also costs three to four weeks of engineering
you do not have. Rent it. The crossover is below.

---

## Phase 2 — your own stack (months 6–15, target 300 presences/month)

Now you build what [document 06](./06-technical-architecture.md) describes, because volume
justifies it and because Content ID and access control make renting impossible anyway
([document 09](./09-platforms-and-clients.md)).

| Layer | Choice | Notes |
| --- | --- | --- |
| Correspondent app | **Kotlin / Android**, CameraX + MediaCodec | Android only. iPhone share in Congo is negligible |
| Segment upload | **HTTP/3 (QUIC)**, resumable, content-hashed | Survives loss and switches SIMs without re-handshaking |
| Ingest & API | **Node/TypeScript** or **Go** | Go if throughput becomes the constraint |
| Transcode | **ffmpeg** on dedicated compute (Hetzner) | Dedicated boxes are far cheaper than cloud instances for steady encoding |
| Packaging | **LL-HLS** with partial segments | 5–15 s glass-to-glass |
| Storage | **Cloudflare R2** | Zero egress is worth more than the per-GB price for video |
| CDN | **Cloudflare**, or Bunny | |
| Player | **hls.js**, your own skin, your own tokens | This is what keeps the CDN swappable |
| Talk mode | **LiveKit** — cloud first, self-host later | Used in bursts, so it scales cheaply |
| Database | Postgres + Redis | |

### Monthly at 300 presences

| Line | Cost |
| --- | --- |
| Transcode compute (2 dedicated servers) | €90 |
| Object storage (~500 GB rolling, 90-day) | €12 |
| CDN egress (~2.2 TB) | €25 |
| SFU for Talk mode | €60 |
| Database, Redis, queues, monitoring | €70 |
| WhatsApp messaging | €150 |
| App hosting | €40 |
| **Total** | **≈ €450 → €1.50 per presence** |

### The crossover, stated plainly

At 300 presences/month, Cloudflare Stream would cost roughly **€700**; running it yourself
costs roughly **€200** of that €450. You save about €500/month, against three to four weeks
of engineering. That repays in six to eight months — so **the right time to bring video
in-house is when you cross about 250–300 presences a month**, which is exactly the phase-2
gate in [document 07](./07-roadmap-and-validation.md). Earlier than that, renting is correct.

### One-time and annual

| | Cost |
| --- | --- |
| Apple Developer Program | **$99/year** — required for iOS and TestFlight |
| Google Play Developer | **$25 once** |
| Push notifications (FCM + APNs) | Free |
| Congolese legal entity | €500–1,500 setup — needed to employ correspondents properly and hold a mobile-money merchant account |

The Congolese entity is not optional forever. Paying correspondents through personal
transfers works for ten events and becomes a serious problem at a hundred, both for tax and
for the trust story in [document 05](./05-operations.md).

---

## Phase 3 — scale (months 15–30, target 2,000 presences/month)

Costs stay roughly linear because the expensive lines — storage and egress — scale with usage
rather than stepping.

| Line | Monthly |
| --- | --- |
| Transcode compute | €400 |
| Storage (~3.5 TB rolling) | €70 |
| CDN egress (~15 TB) | €160 |
| SFU | €280 |
| Database, cache, queues, monitoring | €220 |
| WhatsApp messaging | €900 |
| App hosting, CI, error tracking | €120 |
| **Total** | **≈ €2,150 → €1.08 per presence** |

Note what dominates: **WhatsApp messaging becomes the largest single line.** Worth watching,
and worth pushing users into the native apps from [document 09](./09-platforms-and-clients.md)
where push notifications cost nothing.

---

## The number that actually matters

Infrastructure is not your cost problem, at any phase:

| At 300 presences/month | Per presence |
| --- | --- |
| Infrastructure | **€1.50** |
| Correspondent fee | **€30.00** |

**The operator costs twenty times the infrastructure.** So the strategic instruction from
[document 06](./06-technical-architecture.md) holds at every scale: do not optimise cloud
spend, optimise correspondent utilisation. An hour of a correspondent's time saved is worth
more than any amount of encoding efficiency, and a founder tuning their AWS bill in year one
is optimising the wrong twentieth of the problem.

---

## What not to pay for

Being explicit, because these are the things founders buy and regret:

- **A CRM.** Not at 50 customers, probably not at 500. A spreadsheet and a WhatsApp inbox.
- **HubSpot, Salesforce, Intercom.** Any of these would exceed your entire infrastructure bill.
- **A no-code app builder.** The correspondent app needs hardware camera access, background
  upload and battery management. No no-code tool will do that, and you will pay to discover it.
- **Self-hosting in phase 1.** You would save €70/month and lose a month.
- **A premium domain.** Nobody types the URL. It arrives in WhatsApp.
- **Legal advice on money transmission** — until phase 3. Ride a licensed partner, and read
  the caution in [document 03](./03-business-model.md).
- **Paid advertising before you know K.** Per [`pool/`](../pool), the acquisition budget you
  need is decided by the viral coefficient. Spending before you have measured it means buying
  growth at a price you cannot yet evaluate.

## Total cost to reach each gate

| | Software / infra | Per month, all-in |
| --- | --- | --- |
| **Phase 0** — 10 manual events | ~€1 | ~€300 **once**, mostly correspondent fees |
| **Phase 1** — 50 presences/month | ~€220 | €300–430 |
| **Phase 2** — 300 presences/month | ~€450 | €450 + salaries |
| **Phase 3** — 2,000 presences/month | ~€2,150 | €2,150 + salaries |

The headline: **you can run the entire validation for the price of a domain name**, and the
platform through phase 1 for less than a phone contract. This business is not capital-hungry
in infrastructure. It is capital-hungry in people — engineers in phase 2, correspondents
always — and that is where the funding in [document 07](./07-roadmap-and-validation.md) goes.
