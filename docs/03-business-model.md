# 03 — Business model

## How the money works, in one paragraph

The diaspora books a Presence and pays in euros. The platform pays a local operator in CFA
francs, buys their data bundle, and keeps the difference. Because the cost of a Presence is
fixed per event but the price is paid by *however many relatives want to watch*, gross
margin rises with family size. Around that core sits a set of adjacent products — recordings,
data top-ups, solar, and eventually a contribution rail — that raise frequency and lifetime
value between events.

## A structural gift: the CFA franc is pegged to the euro

Worth stating early because it removes a risk that usually plagues this kind of business.

The Central African CFA franc (XAF) is pegged to the euro at a **fixed 655.957 XAF = €1**,
with convertibility guaranteed by the French Treasury. For a France→Congo corridor this
means:

- **No FX risk on the payout side.** Revenue in euros, costs in a euro-pegged currency.
  Margins do not move because a central bank had a bad week.
- **No FX spread to hide or explain.** Prices can be quoted honestly in both currencies at a
  fixed rate, which is a trust advantage in a market where remittance customers are used to
  being quietly skimmed on the rate.
- **The same peg covers Cameroon, Gabon, Chad, CAR and Equatorial Guinea** (XAF), and the
  West African CFA franc (XOF) is pegged at the identical rate — Senegal, Côte d'Ivoire,
  Mali, Benin, Burkina Faso, Togo, Niger, Guinea-Bissau.

So the entire francophone African expansion path, roughly fourteen countries, runs on a
currency fixed to the currency the customers earn in. Very few Africa-facing businesses get
that. It should be exploited deliberately: it makes multi-country pricing trivial and makes
the eventual payments product structurally cheaper than the incumbents.

## Revenue streams, in order of when to build them

### 1. Presence bookings — the core (day one)

The tiers from [document 02](./02-solution.md): **Appel** €15 / **Fête** €39 / **Cérémonie**
€89 / **Grand Événement** €250–450.

The prices are anchored deliberately. Against a free WhatsApp call they look expensive.
Against the alternatives the customer is actually weighing, they are not:

- a flight Paris→Brazzaville: €700–1,100, plus leave from work;
- a professional videographer booked locally for a wedding: €300–800, weddings only;
- the status quo: repeatedly asking your family for a favour they cannot give, and missing
  the event anyway.

The correct frame in all marketing is **"the price of being there"**, never "the price of a
video stream." Nobody has a budget line for video streaming. Everybody has one for family.

### 2. The family pool — the multiplier (day one, same build)

This is the most important commercial mechanic in the company and it is cheap to build.

The person who books shares a link into the family WhatsApp group. Other relatives abroad
join the Presence and contribute. Everyone sees who has paid and how much is left, the same
way the family already collects for a funeral.

Three effects, all large:

**Conversion.** €89 alone is a decision. €9.89 as one of nine is not. Splitting collapses
the individual price below the threshold where people deliberate.

**Revenue per event.** A pool of six at €8 yields €48 for an event priced at €39 — the
platform captures more than the list price because willingness to pay is heterogeneous and
the pool lets each person self-select.

**Acquisition.** Every booking puts the product in front of five to fifteen new diaspora
members, inside a private family group, introduced by a trusted relative, at a moment of
high emotional relevance. That is the highest-trust acquisition channel that exists, and it
costs nothing. **The pool is not a payments feature. It is the growth engine, and it should
be built first, not "later when we have users."**

One important cost caveat: many small card payments cost far more to process than one large
one. Nine payments of €10 incur roughly €3.60 in fees against €0.84 for a single €89 charge.
Mitigations, in order of preference: a stored balance so repeat contributors pay from a
pre-funded wallet; SEPA direct debit for French and Belgian contributors (a few cents, not
1.5% + €0.25); and a minimum contribution of €5.

### 3. Keepsakes and recordings (month 3)

Sold *after* the event, when the emotional peak has already happened and the customer has
just had a good experience:

| Product | Price | Cost | Margin |
| --- | --- | --- | --- |
| Extra viewer access to the recording | €5 | ~€0.10 | ~98% |
| Professionally edited film (10–15 min) | €59 | ~€12 (local editor) | ~80% |
| Printed photo book, shipped | €45 | ~€22 | ~51% |
| USB/archive copy delivered to family in Congo | €19 | ~€6 | ~68% |

High margin, no marginal operator cost, and it monetises the long tail of relatives who did
not join live. For funerals the edited film is not an upsell so much as an expectation — it
becomes the family's record of the ceremony.

### 4. Data and power top-ups (month 6) — the frequency product

Bookings are episodic; a family might have four events a year. That is not enough contact to
build a habit. Two products fill the gap and both attack constraints from
[document 01](./01-problem.md) directly:

**Data top-up.** Sylvain buys a data bundle for his mother's own phone from inside the app,
so their ordinary weekly WhatsApp calls stop being rationed. Airtime resale margins are thin
(3–8%) and that is fine — this exists for frequency and retention, not profit. It is also
the single most requested thing in every diaspora WhatsApp group.

**Power.** Partner with a pay-as-you-go solar operator (Bboxx, Sun King and d.light all sell
in Central Africa) so the diaspora can fund a solar home system for the family on
instalments, earning a referral commission. This is the only intervention that permanently
removes constraint #2, it makes every future Presence cheaper and more reliable, and it is a
genuinely good thing to have done for the household. A family with a solar panel is a family
whose phone is charged, whose events can be streamed, and who churn out of the platform
almost never.

### 5. The contribution rail (year 2+) — where this becomes a large company

At a *matanga* or a wedding, diaspora relatives are already sending money. Today that
happens by Western Union, Wise, Taptap Send or an informal courier, disconnected from the
event itself.

If those relatives are already watching the ceremony inside Elongo — authenticated, present,
emotionally engaged, at the exact moment the money is needed — then contributing inside the
stream is strictly easier than leaving to use another app. The family in Congo receives it
by mobile money before the ceremony ends, and everyone in the group sees a transparent
ledger of who gave what, which is itself a socially valuable artefact in a culture where
these contributions are publicly acknowledged.

Remittances to Congo-Brazzaville run around **$220 million a year**,[^rem] and that is one
small country in a francophone corridor worth billions. A 2–3% take on even a modest share
is a business several times larger than the streaming service.

Two hard cautions. **This is a licensed activity** — payment institution authorisation, AML
and KYC obligations, per-country money transmission rules. Ride on a licensed partner
(a BaaS provider or an existing MTO) until volume justifies the two years and seven figures
that own-licence would cost. And **do not lead with it.** Payments companies that start as
payments companies compete with Wise on price. A payments company that starts as the place
where your family's wedding happens competes on something nobody can copy.

## Unit economics

Costs in euros. Operator pay shown in XAF at the fixed peg.

### Fête — €39, three hours, single payer

| Line | Cost | Note |
| --- | --- | --- |
| Operator fee | €12.00 | 8,000 XAF for ~3.5 h including travel |
| Data bundle | €3.00 | ~1.2 GB at retail bundle rates,[^data] with headroom for retries |
| Transport stipend | €3.00 | 2,000 XAF, taxi both ways within Brazzaville |
| Payment processing | €0.84 | 1.5% + €0.25, single European card |
| Infrastructure | €1.00 | Transcode, egress to ~9 viewers, 90-day storage |
| **Total COGS** | **€19.84** | |
| **Gross profit** | **€19.16** | **49% margin** |

### Fête — same event, family pool of six at €8

| Line | Amount |
| --- | --- |
| Revenue | €48.00 |
| Operator + data + transport + infra | €19.00 |
| Payment processing (6 × €0.37) | €2.22 |
| **Total COGS** | **€21.22** |
| **Gross profit** | **€26.78** — **56% margin** |

The same operator, the same three hours, the same bundle. Revenue rose 23% and gross profit
rose 40%, because the costly inputs are per-*event* and the revenue is per-*person*. That is
the operating leverage a videographer does not have, and it is why the pool is the priority.

### Cérémonie — €89, eight hours, pool of nine at €10

| Line | Cost |
| --- | --- |
| Operator fee (8 h) | €30.00 |
| Data bundle (~3 GB) | €4.50 |
| Transport + meal stipend | €6.00 |
| Payment processing (9 × €0.40) | €3.60 |
| Infrastructure + auto-highlight render | €2.50 |
| **Total COGS** | **€46.60** |
| Revenue | €90.00 |
| **Gross profit** | **€43.40** — **48% margin** |

The professionally edited film stays a **€59 add-on** rather than being bundled: human
editing costs €12 and would drag the base tier's margin by twelve points. Roughly a third of
Cérémonie customers should take it, adding ~€15 average revenue at ~80% margin.

### Blended target

A mature market mix (50% Fête, 25% Appel, 20% Cérémonie, 5% Grand Événement) with an average
pool of 4.2 payers gives roughly **€52 revenue and €26 gross profit per Presence, at ~50%
gross margin**, before add-ons and before platform overhead. Add-ons attach at ~25% and lift
the blend to ~54%.

Fifty per cent is a healthy marketplace margin and it is *defensible* here, because the
biggest cost line — the operator — is paid at Congolese rates while the revenue is earned at
French ones. That gap is not a temporary arbitrage; it is the same asymmetry from
[document 01](./01-problem.md) that makes the whole business possible.

### Lifetime value and acquisition

Honest caveat first: **every number in this subsection is an assumption, not a measurement.**
They are the numbers to go and test, and [document 07](./07-roadmap-and-validation.md)
explains how to test them for under €500.

| Metric | Estimate | Reasoning |
| --- | --- | --- |
| Presences per active account per year | 5 | Mix of self-booked and pooled participation. Congolese family calendars are dense: birthdays, baptisms, *dot*, weddings, funerals, *retrait de deuil* |
| Average spend per presence | €18 | Blend of solo bookings and pool contributions |
| Annual revenue per account | €90 | |
| Gross margin | 52% | Including add-ons |
| Annual contribution | €47 | |
| Retained years | 3 | Family events do not stop; the risk is the service being forgotten between them, which is what streams 4 and 5 exist to prevent |
| **LTV** | **≈ €140** | |
| Blended CAC | €8–15 | Heavily weighted by viral pool acquisition at ~€0 against paid social at €15–25 |
| **LTV:CAC** | **≈ 9–17×** | |

A ratio that high is a signal to be suspicious of, not proud of. It rests almost entirely on
the pool mechanic delivering cheap acquisition. If the pool underperforms and CAC lands at
€30, the ratio falls to ~4.7× — still a viable business, but a different one, funded
differently. **Measure the pool's viral coefficient before believing anything else here.**

## What the platform charges the operator

Operators are paid a fixed fee per Presence, published in advance, in XAF, plus tips passed
through in full. The platform's take is the difference between the customer price and the
sum of operator fee, data, transport and processing — roughly 45–55%.

Two principles that matter more than the number:

- **The operator never pays for data.** Ever. The moment an operator is out of pocket for a
  bundle, the marginal gig stops being worth answering and the supply side rots.
- **Payment lands the same day, by mobile money.** MTN MoMo and Airtel Money are both
  ubiquitous in Congo.[^momo] Same-day payment is the single strongest retention lever for a
  gig workforce, and it is cheap to offer.

## Pricing psychology, briefly

- **Quote the split, not the total.** "€89, or €9.89 each if nine of you join" converts far
  better than "€89."
- **Never discount a funeral.** Do the opposite: a bereavement tier that is generously
  priced, delivered flawlessly, and never upsold. Families remember who behaved well during
  a death, permanently, and they tell everyone. This is the most powerful reputational asset
  available and it is destroyed by any hint of extraction.
- **Price in the customer's currency and country.** €39 in France, £34 in the UK, $45 in the
  US, CAD 59 in Canada. Never make a grieving customer do arithmetic.
- **Sell the guarantee explicitly.** *"If the network fails, you still receive the complete
  recording — or you do not pay."* That promise is deliverable because of the architecture in
  [document 06](./06-technical-architecture.md), and no competitor can make it without
  rebuilding their pipeline.

---

[^rem]: World Bank Migration and Development data, cited in *Republic of the Congo: Facts &
Figures — Remittances*, Diaspora for Development. Remittance inflows to Congo-Brazzaville
estimated at ~$220m (2023). <https://diasporafordevelopment.eu/wp-content/uploads/2020/07/CF_Congo-v.3.pdf>

[^data]: Airtel Congo retail bundle pricing, ~6 GB / 7 days for 6,000 XAF (≈€9.15), i.e.
~€1.50/GB on bundle rates; headline per-GB averages for the country are considerably higher.
<https://www.phonetravelwiz.com/buying-a-sim-card-in-the-republic-of-the-congo-guide/>

[^momo]: MTN MoMo and Airtel Money are the two dominant mobile money services in
Congo-Brazzaville, with inter-operator transfers available.
<https://momocalc.com/congo>
