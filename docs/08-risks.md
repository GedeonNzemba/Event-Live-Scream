# 08 — What kills this business

Ordered by how likely each is to be the actual cause of death, not by how dramatic it
sounds. The technical risks are near the bottom on purpose: they are the ones a technical
founder will over-index on, and they are not the dangerous ones.

## 1. Nobody pays, because free is a very strong competitor

**The risk.** WhatsApp video calls are free and already installed. However bad the
experience, it is bad *and free*, and families have adapted to it. The gap between "this is
frustrating" and "I will pay €39 to fix it" is where most consumer businesses die.

**Why it might be fine.** The scenario in [document 01](./01-problem.md) is not a person
complaining about video quality. It is a person being *refused* — the call does not happen at
all. That is a much stronger purchase trigger than dissatisfaction, and the alternative being
priced against is a €900 flight, not a free app.

**What to do.** The thirty-day validation in [document 07](./07-roadmap-and-validation.md)
exists entirely to test this, before anything is built. Ten events, €25, real money. If
conversion is poor, the honest options are to reprice toward the funeral and wedding
occasions where willingness to pay is highest, or to stop.

**Early warning:** quote-to-pay conversion below 30% in the concierge phase.

## 2. The pool does not materialise, and the economics quietly halve

**The risk.** [Document 03](./03-business-model.md) leans hard on multiple family members
splitting the cost — for revenue *and* for near-zero-CAC acquisition. If in practice one
person always pays and nobody else joins, revenue per event falls, CAC rises to paid-social
levels, and LTV:CAC drops from ~13× to ~4.7×. Still a business, but a slower, more
capital-hungry one that needs a different funding story.

**Why it might be fine.** Congolese families already pool money for funerals through WhatsApp
groups and mobile money.[^drc] The behaviour exists; we are attaching a camera to it, not
inventing it.

**What to do.** Measure the pool coefficient from event one. Make contributing take one tap
from inside WhatsApp with no account creation. Quote the split price, never the total.

**Early warning:** fewer than 4 of 10 concierge events attracting a second payer.

## 3. A correspondent behaves badly at a funeral

**The risk.** The most damaging single event available to this company. Someone films a body
without permission, films a family's grief close-up, argues with an elder, arrives drunk, or
solicits a side payment — at a funeral, in a community that talks constantly and remembers
permanently. One incident can end the business in a diaspora of this size.

**What to do.** All of [document 05](./05-operations.md), but especially: the cultural
protocol module as a hard gate before any funeral booking; *casier judiciaire* required for
bereavement and child-centred events; the family's word overriding the paying customer's,
written into the customer's terms so it is never a surprise; a one-tap PAUSE; immediate
removal for filming after being told to stop.

**And structurally: prefer family-nominated correspondents.** A nephew the family chose
cannot be a stranger who behaved badly at their father's funeral. This is the strongest
mitigation available and it is also the cheapest supply channel — which is a rare alignment
and should be exploited deliberately.

## 4. Consent, and the people who never agreed to be filmed

**The risk.** The paying customer is in France. The fifty people at the wedding in
Brazzaville are not customers and have not agreed to anything. Filming and transmitting them
to another continent, then storing it, is a real legal and ethical exposure — GDPR reaches
the processing regardless of where the camera was, and "the person paying said it was fine"
is not a lawful basis for the guests.

**What to do.** Host consent captured explicitly and timestamped before capture starts, no
consent meaning a full refund and no argument. Private by default, unlisted, expiring tokens,
no public discovery ever. A visible badge so nobody is filmed covertly. Deletion honoured on
request **from the filmed family**, not only from the payer. Twelve-month retention by
default, because data you no longer hold cannot leak.

Take this seriously beyond compliance. A company built on family trust that treats the
filmed family as scenery deserves to fail, and would.

## 5. Supply-side collapse

**The risk.** Marketplaces usually die from the supply side, quietly. Correspondents drift
away, response times stretch, bookings go unfilled, reviews fall, demand follows. It looks
like a demand problem right up until it is unrecoverable.

**What to do.** Same-day MoMo payouts, always. **The platform buys the data, always** — the
moment a correspondent is out of pocket for a bundle, the marginal gig stops being worth
answering and nobody files a complaint about it. Published rates with no opaque surge.
Protect good correspondents from bad-network reviews using the telemetry in
[document 05](./05-operations.md), which distinguishes "the operator was bad" from "the
network was bad" — a distinction customers cannot make and will always resolve against the
operator.

**Early warning:** utilisation falling below 4 presences/month per active correspondent, or
six-month retention below 50%.

## 6. Internet shutdowns and political instability

**The risk.** Central African governments have restricted or shut down internet access around
elections and unrest, and Congo-Brazzaville is not an exception. A multi-day national
shutdown stops every live stream in the country, and it will happen at some point.

**Why the architecture already helps.** Store-and-forward means a shutdown *delays* delivery
rather than destroying it. Events captured during a blackout upload when connectivity
returns. This is a genuine and unusual resilience property and it is worth saying to
investors: a competitor built on RTMP simply loses those days permanently.

**What to do.** Communicate honestly and immediately when it happens; the customer's anxiety
is uncertainty, not delay. Never charge for a live stream that did not happen — deliver the
archive and refund the difference. Geographic diversification from phase 3 means a single
country's politics cannot stop the company.

## 7. The unit economics erode at scale

**The risk.** Concierge-phase economics are flattered by a founder doing operations for free.
At scale you add support, dispute handling, correspondent management, no-show reassignment
and refunds. Real-world completion rates below 90% mean paying for events that generate no
revenue, and the ~50% gross margin in [document 03](./03-business-model.md) can become 30%.

**What to do.** Track fully-loaded contribution per presence, including support time and
refunds, from the beginning — not headline gross margin. Automate dispatch and payouts before
scaling headcount. Watch operator fees: they will need to rise as correspondents become
skilled, and the pricing must have room for that.

## 8. Key-person concentration

**The risk.** Early distribution depends almost entirely on the founder's standing in the
Congolese diaspora and their family network in Brazzaville. That is a genuine and rare
advantage and also a single point of failure. It is not obviously transferable to an employee,
and investors will ask.

**What to do.** Convert personal trust into institutional trust early: recruit correspondents
who bring their own community, build a public track record around bereavement service,
document the operating playbook so a Kinshasa launch does not require the founder to be
physically present.

## 9. A well-funded copycat

**The risk.** The idea is not patentable and the pitch is easy to repeat. A funded competitor
could enter with better engineering.

**Why it is lower than it looks.** Re-read the moat ordering in
[document 04](./04-market-and-competition.md): the weakest moat is the technology and the
strongest is trust at funerals, which cannot be bought or accelerated with capital. A
competitor can copy the ladder in six months and cannot copy a decade of families who
remember who behaved well when their mother died.

**What to do.** Spend founder time on correspondents and families, not in the codebase. Go
deep in one corridor before going wide. Own the bereavement lane completely — it is the
highest-trust, highest-emotion, least price-sensitive segment, and it is the one a
venture-funded generalist will find hardest to serve well.

## 10. Real networks are worse than modelled

**The risk.** The link profiles in [`prototype/`](../prototype) are engineering
approximations shaped by published aggregates, not traces from Brazzaville. Real conditions
may be worse in ways the model does not capture: asymmetric uplink throttling, carrier-grade
NAT interfering with QUIC, deep-packet inspection, or simple mid-event congestion collapse
when two hundred guests all start uploading photographs.

**What to do.** Capture real traces during the concierge phase — even a phone logging
throughput every second at ten real events is worth more than any amount of modelling — and
replace the fixtures. The prototype README says this explicitly and it should be the first
engineering task of phase 2.

**Note the asymmetry.** If networks turn out worse than modelled, the store-and-forward
architecture *gains* relative advantage, because the gap between "best-effort live" and
"guaranteed archive" widens. The design fails safe.

## 11. Regulatory drag on the payments ambition

**The risk.** The contribution rail in [document 03](./03-business-model.md) is a licensed
activity: payment institution authorisation, AML and KYC, per-country money transmission
rules. Pursued too early it consumes years and seven figures and starves the actual product.

**What to do.** Ride a licensed partner until volume genuinely justifies otherwise. Do not
put "fintech" in the phase-1 pitch. The sequencing matters and it is easy to get wrong under
investor enthusiasm: **a company that owns the wedding can add payments; a company that owns
payments cannot acquire the wedding.**

## The three that actually decide it

If only three things get watched:

1. **Quote-to-pay conversion in month one.** Does anybody pay?
2. **Pool coefficient.** Does one event produce several payers?
3. **Correspondent retention at six months.** Does supply hold?

Everything else in this document is manageable. Those three are the business.

---

[^drc]: France 24, "In DR Congo, cost of funerals is a crippling burden for the bereaved" —
diaspora relatives coordinate funerals and collect contributions through WhatsApp groups and
mobile money. <https://www.france24.com/en/20180120-dr-congo-cost-funerals-crippling-burden-bereaved>
