# 07 — Roadmap and validation

## Do this first: thirty days, under €500

**Do not write product code yet.** The riskiest assumption in this entire repository is not
technical — the prototype already shows the engineering works. It is whether ten diaspora
families will hand over money for a hand-operated version of this. If they will not pay for
a scrappy one, they will not pay for a polished one, and finding that out costs a weekend
instead of a year.

Run the whole thing by hand. No app, no platform, no company.

### The stack for month one is off-the-shelf

| Need | Use | Cost |
| --- | --- | --- |
| Streaming | YouTube **unlisted** live from the correspondent's phone | €0 |
| Recording | YouTube keeps it automatically; also record locally on the phone | €0 |
| Booking | A WhatsApp Business number you answer yourself | €0 |
| Payment | A Stripe payment link, or Lydia/Revolut for French customers | ~1.5% |
| Power | One 20,000 mAh power bank | €18 |
| Data | Prepaid bundles bought for the correspondent | ~€30 |

YouTube unlisted is a genuinely good choice for this phase and not a compromise: it is free,
its adaptive bitrate is excellent, it degrades rather than dropping, it scales to any number
of relatives, it needs no app on the viewer's side, and it records automatically. It does
*not* do store-and-forward, audio-floor, or power budgeting — which is exactly the gap the
real product fills, and month one is not the time to prove that.

### Weeks 1–2: line up supply and demand

**One correspondent.** A cousin, a friend's younger brother, someone's nephew in Brazzaville.
Pay them properly — 8,000 XAF (€12) per event — and tell them it is a real job with real
standards. Walk them through the conduct and protocol rules in
[document 05](./05-operations.md); those matter from event one, not from event one hundred.

**Ten events.** Find them in Congolese diaspora Facebook groups in France and Belgium, in
your own family WhatsApp groups, and by asking every Congolese person you know in Paris who
has a wedding or a *dot* coming up. Say plainly: *"€25, someone will be there with a camera
and a charged battery, you get the live stream and the full recording."*

Price it at **€25 flat** — one number, no tiers. Tiering is a month-six problem.

### Weeks 3–4: run them, and watch the right things

Deliver all ten yourself. Answer the WhatsApp messages personally. Call each customer
afterwards.

Track exactly six numbers:

| Metric | Why it is the one that matters |
| --- | --- |
| **Quote → pay conversion** | Does the price survive contact with a real customer? |
| **Payers per event** | Did anyone else in the family chip in *unprompted*? This is the pool coefficient, and the whole business model rests on it |
| **Completion rate** | Of events booked, how many actually happened and were delivered? |
| **"Would you do it again?"** | Asked on a call, not in a form |
| **Unprompted mentions of the recording** | If people ask for the recording without being told about it, the archive guarantee is the product — build that first |
| **What they asked for that you did not offer** | The real roadmap is in this column |

### Pre-commit to the success criteria, now, before you start

Writing these down in advance is the whole point. Deciding afterwards what counts as success
is how founders talk themselves into a year of work on a bad idea.

- **≥ 6 of 10** booked events completed and delivered
- **≥ 7 of 10** customers say they would book again
- **≥ 4 of 10** events attract a second paying family member without being pushed
- **Median rating ≥ 4/5**

Hit those and you have a business worth funding. Miss the third one badly and the economics
in [document 03](./03-business-model.md) do not hold — the pool multiplier is doing most of
the work there, and a business where every event has exactly one payer is a much smaller,
much harder company that needs a different plan.

**Total cost: correspondent €120, data €30, power bank €18, contingency €100 — under €300**,
plus a month of your evenings.

## The phased roadmap

### Phase 0 — Concierge (month 1)
Above. Ten events, by hand, in Brazzaville. Deliverable: a yes/no on the four criteria.

### Phase 1 — Minimum viable platform (months 2–6)

Still substantially manual, but repeatable. Not the real product.

- WhatsApp Business booking with template messages and a human in the loop
- Stripe payment links, and the **family pool as a shared link** — this is the one thing
  worth building properly this early, because it is the growth engine
- Streaming still on a hosted service (Mux or Cloudflare Stream); no custom client yet
- 5–10 correspondents in Brazzaville, recruited, vetted and trained per
  [document 05](./05-operations.md)
- Same-day MoMo payouts, done manually if necessary
- Tiered pricing introduced once there is enough data to place the tiers

**Target: 50 presences/month by month 6. Capital: €25–40k.** Mostly founder time plus a
part-time operations person in Brazzaville. Fundable from savings, friends and family, or a
diaspora-focused grant.

**Gate to phase 2:** 50 presences/month, pool coefficient above 2.5, 40% of customers
booking a second event within 90 days.

### Phase 2 — The real product (months 6–15)

Now build the thing in [document 06](./06-technical-architecture.md), because now you know
it will be used.

- Android correspondent app: segment store, degradation ladder, power budgeting, resumable
  prioritised upload. The prototype in [`prototype/`](../prototype) is the specification
- Browser viewer, no install, WhatsApp-delivered links
- Ingest, packaging, archive assembly, completeness tracking
- Correspondent app with ratings, telemetry and automated payouts
- Talk mode
- Expand to Pointe-Noire and Dolisie

**Target: 300 presences/month. Capital: €300–500k pre-seed** — two engineers (Android,
backend), an operations lead in Congo, 15 months of runway.

**Gate to phase 3:** 300 presences/month, gross margin above 45%, correspondent retention
above 60% at six months.

### Phase 3 — Scale and kits (months 15–30)

- Company-owned kits: locked-down dual-SIM Android, big battery, gimbal, wide lens
- **Dual-SIM bonding** — the largest remaining quality lever and the hardest to copy
- Cross the river to **Kinshasa**: same language, same ceremonies, ten times the diaspora
- Then Cameroon and Côte d'Ivoire, both large francophone diasporas in France, both on
  euro-pegged currencies
- Data top-ups and PAYGo solar referrals, for frequency between events

**Target: 2,000 presences/month. Capital: €2–3M seed.**

### Phase 4 — The rail (month 30+)

- In-stream contributions on a licensed partner's rails, with a transparent family ledger
- Subscription "always-on" presence: a solar-charged, single-purpose, remotely-managed unit
  in the family compound. Recurring revenue, near-zero churn
- This is where the company stops being a services business and becomes a large one — see
  [document 03](./03-business-model.md)

## Metrics that matter

**North star: presences delivered per month.** Not users, not signups, not GMV. It is the
only number that captures both sides of the marketplace actually working.

| Metric | Target | Note |
| --- | --- | --- |
| **Pool coefficient** (paying participants per presence) | > 3.0 | The single most important number in the business. Drives revenue *and* CAC |
| Archive completeness | > 99.5% | The promise. Anything less and the refund guarantee is unaffordable |
| Completion rate (delivered / booked) | > 92% | Below this, correspondent reliability is the problem |
| Repeat rate at 90 days | > 40% | Family calendars are dense; a low number means we were forgettable |
| Correspondent utilisation | 6–10 presences/month | Too low and they drift away; too high and quality drops |
| Correspondent retention at 6 months | > 60% | Supply-side churn is the quiet killer of marketplaces |
| Gross margin | > 45% | Per [document 03](./03-business-model.md) |
| Bereavement response time | < 4 h | The lane that generates word of mouth |

Two anti-metrics worth watching because they will look good while the business rots:
**revenue per customer rising while pool coefficient falls** (you are squeezing individuals
instead of growing families), and **completion rate rising while correspondent retention
falls** (you are leaning on a few heroes who are about to quit).

## What to build first, in order

If there is only time for one thing at each stage:

1. **The family pool.** Growth engine and revenue multiplier in one feature.
2. **The segment store and resumable upload.** The archive guarantee is the differentiator
   and the refund policy depends on it.
3. **The degradation ladder with an audio floor.** Turns unusable events into acceptable ones.
4. **Same-day MoMo payouts.** Supply dies quietly without this and you find out too late.
5. **Power budgeting.** Cheap to build, and it directly answers the objection in the original
   scenario — *"the battery will not last"*.
6. Everything else.
