# 05 — Operations: the correspondent network

The technology in [document 06](./06-technical-architecture.md) is the easier half of this
company. This document is the harder half. Elongo's actual product is *a stranger you trust
enough to stand in your mother's living room during her funeral*, and everything below
exists to make that sentence true.

## The correspondent

We call operators **correspondants** — a deliberate word. Not "driver", not "gig worker",
not "cameraman". A correspondent is someone sent to represent you at something you cannot
attend. That framing sets the standard of behaviour we want and the status the role should
carry locally.

**Profile.** 18–32, lives in Brazzaville or Pointe-Noire, owns an Android with a usable
camera (Android 10+, 3 GB RAM, 1080p30 rear camera), literate in French, speaks Lingala
and/or Kituba, has a mobile money account in their own name, and — critically — has time on
a Saturday.

**Why they say yes.** Congolese youth unemployment and underemployment are severe. A €12
payout for a three-hour Saturday afternoon, paid the same day into MoMo, is real money. A
correspondent doing eight Presences a month earns around 65,000 XAF (€100) for weekend work,
which is a meaningful supplementary income and does not require them to leave another job.
The role also carries social status: you are the person who brings the family in France to
the wedding. That matters, and it should be leaned on in recruitment.

## Two supply channels, and the second is better

**Channel A — the open network.** Recruit, vet and train correspondents who take whatever
bookings come in. Standard marketplace supply. Necessary for coverage and for last-minute
dispatch.

**Channel B — the family-nominated correspondent.** The diaspora customer names someone
themselves: a nephew, a godson, a neighbour's son. Elongo verifies them, trains them
remotely in about forty minutes, equips them, and pays them for the event.

Channel B is strictly better wherever it is available and should be the *default offer*, not
the fallback:

- **It solves trust instantly.** No vetting problem exists when the family chose the person.
- **It solves supply.** Every booking can bring its own operator, so the network is not
  gated on how many people we have recruited in a given town.
- **It solves reach.** A wedding in a village in the Cuvette is unservable by an open network
  and perfectly servable by a nephew who lives there.
- **It converts the objection.** "I don't want a stranger at my father's funeral" is the
  single most likely reason to refuse, and this answers it completely.
- **It is cheaper to acquire.** The nephew is not a marketing cost.

And it *keeps the value*, because what the family cannot supply is exactly what Elongo
supplies: the training, the power bank, the paid data bundle, the resilient software, the
distribution to nine relatives in five countries, and the guaranteed recording. The nephew
was always available. The infrastructure never was.

The strategic reading: **Elongo is not really a labour marketplace. It is an equipping and
distribution layer that can run on either its own operators or the family's.** That is a
much more capital-efficient business and a much faster expansion path.

## Vetting

Proportionate to what is being trusted, which is a lot.

| Step | Open network | Family-nominated |
| --- | --- | --- |
| Government ID, photographed and matched to a selfie | Required | Required |
| Mobile money account in the same legal name | Required | Required |
| Two local references, called by a human | Required | Waived — the family is the reference |
| Video interview in French and Lingala | Required | Short call only |
| Certificate of good conduct (*casier judiciaire*) | Required before funeral or child-centred events | Not required |
| Training module + assessed practice stream | Required | Required |
| Probation: first 3 Presences reviewed by ops | Required | Required |

The certificate requirement is deliberately scoped to funerals and events involving
children, where the trust burden is highest and where a failure would be unrecoverable for
the brand. Requiring it universally would throttle supply for no proportionate gain.

## Training

Forty minutes, delivered in the app, in French with Lingala voice-over, ending in a
practice stream that a human reviews. Five modules:

1. **The equipment.** Charging discipline, power bank use, what the battery indicator means,
   why the preview screen gets turned off.
2. **The craft.** Hold still. Both hands. Stop walking while recording. Get close for
   speech — the microphone is the product. Frame faces, not ceilings. Ninety seconds on each
   of these is enough to move quality more than any amount of camera hardware.
3. **The protocol.** Covered below in its own section, because it is the one that gets
   people hurt.
4. **The technology.** What the status bar means, what to do when it says the network is
   weak (nothing — keep filming, the app is handling it), how to trigger Talk mode, what to
   do if the phone dies.
5. **The conduct.** Arrive thirty minutes early. Greet the head of the family first, always.
   Dress for the occasion — dark and plain for a funeral. Do not eat before the guests. Do
   not drink. Do not ask for a tip. Do not accept side payments to keep filming.

## Cultural protocol — the module that matters most

A Congolese *matanga* is not a Western funeral, and a *dot* is not a Western engagement
party. Both have moments that are private, moments that are for family only, and moments
where a camera is an insult. An operator who films the wrong thing does not merely make a
bad video; they cause a real injury to a real family and end the company's reputation in a
community that talks.

Non-negotiable rules, taught explicitly and enforced by suspension:

- **The family's word overrides the customer's, always.** If the head of the family says
  stop, the camera stops — even though the person in Paris is paying and asking to continue.
  This must be stated in the customer's terms of service too, so it is never a surprise.
- **Do not film the body without explicit permission from the head of the family**, obtained
  in advance and recorded in the app.
- **Do not film grief close-up.** Wide shots during collapse and mourning. Never a face in
  distress at close range.
- **Do not film private ritual** — the *dot* negotiation between families, traditional rites,
  anything where an elder indicates the camera should look away.
- **Do not film children other than the celebrant** without a parent present and consenting.
- **Do not film money changing hands** during contributions, unless the family has asked for
  it. In some families this is a public honour and filming it is welcome; in others it is
  deeply private. Ask.

The app enforces what it can: a mandatory pre-event checklist the correspondent walks through
with the head of the family, with each permission recorded as an explicit yes or no, and a
prominent **PAUSE** control that blurs and mutes instantly and is reachable one-handed.

## Consent — the piece most platforms get wrong

The customer is in France. The people being filmed are in Congo and are not the customer.
They have not agreed to anything by existing at a wedding.

- **The host consents, before anything starts.** The correspondent gets a verbal yes from the
  head of the family, in the app, with a timestamp. No consent, no Presence — and the
  customer is refunded in full, no argument.
- **Streams are private by default.** Unlisted link, expiring token, viewer list visible to
  the family. No public discovery, ever, for any reason.
- **A visible indicator.** The correspondent wears a marked lanyard or badge. Everyone in the
  room can see that filming is happening and who is doing it. Covert recording would destroy
  this business and deserves to.
- **Deletion on request from the family, not just the customer.** If the family in Congo asks
  for a recording to be destroyed, it is destroyed, even though they never paid. This will
  occasionally cost money and it is not negotiable.
- **Retention is finite.** Recordings expire after 12 months unless the customer buys an
  archive. Less stored data is less risk, and GDPR applies to the customer relationship
  regardless of where filming occurred.

## Dispatch

Demand splits into two lanes with very different operational requirements.

**Planned lane (~80%).** Weddings, *dot*, baptisms, birthdays, graduations, *retrait de
deuil*. Booked days or weeks ahead. Assignment is a scheduling problem: match on proximity,
rating, language and equipment; confirm 48 h and 3 h before; auto-reassign on a missed
confirmation.

**Bereavement lane (~20%).** A death is announced and the burial follows within days. This
is the highest-emotion, highest-value, most time-critical demand in the business and it
cannot wait for a scheduling algorithm.

The bereavement lane gets its own treatment: a **human on call**, a promise of an assigned
correspondent within four hours, a standing roster of senior correspondents who accept
short-notice work at a premium, and — importantly — **no upsells, no discounting, no
automated marketing emails to that customer for thirty days.** How a company behaves around a
death is remembered permanently. Get this lane right and it will produce more growth than
any advertising budget.

## Equipment and logistics

**Phase 1 — bring your own device.** The correspondent uses their own Android. Elongo
supplies, on loan, a kit that costs about €55:

| Item | Cost |
| --- | --- |
| 20,000 mAh power bank | €18 |
| Compact phone gimbal | €22 |
| Clip-on directional microphone | €9 |
| Branded lanyard + badge | €4 |
| Charging cable, pouch | €2 |

Held against a refundable 15,000 XAF (€23) deposit, or earned outright after ten completed
Presences — which is a better mechanic, because it costs the same and it buys ten Presences
of retention.

**Data is always ours.** The platform buys the bundle and pushes it to the correspondent's
SIM before the event. This is stated twice in these documents on purpose: the moment a
correspondent is out of pocket for data, the marginal booking stops being worth answering,
and supply quietly dies without anyone filing a complaint.

**Phase 2 — the Elongo kit.** A company-owned, locked-down Android with dual SIMs (MTN +
Airtel), a large battery, a gimbal and a wide lens, at roughly €180 amortised over ~200
Presences (€0.90 each). This removes device-quality variance, enables the SIM bonding in
[document 06](./06-technical-architecture.md), and lets the software assume hardware it
controls. Deploy only to correspondents past 20 Presences with a rating above 4.7.

## Paying correspondents

- **Same day, by mobile money**, to MTN MoMo or Airtel Money in their own name.[^momo] Not
  weekly, not on invoice. Same-day payment is the strongest retention lever available for
  gig work and it is nearly free to provide.
- **Published rates, no surge, no opaque algorithm.** The fee for each tier is fixed and
  visible before accepting. Trust in the payout is what keeps a network alive.
- **Tips pass through at 100%**, and the customer is prompted after a good stream. Tips
  routinely add 15–25% to a correspondent's earnings and cost the platform nothing.
- **A bereavement premium** of +50% for short-notice funeral work. It is harder, sadder and
  more demanding, and it should pay accordingly.

## Quality management

Three signals, weighted:

1. **Customer rating** (1–5) plus a required tag on anything below 4 — the tag is what makes
   the data actionable.
2. **Technical telemetry**, gathered automatically and far more honest than ratings: mean
   delivered bitrate, seconds spent at the audio-only floor, camera-motion stability,
   audio clipping, percentage of the booked duration actually captured.
3. **Ops review** of the first three Presences and of any flagged event.

Telemetry deserves emphasis because it lets us separate **"the correspondent was bad"** from
**"the network was bad"** — a distinction customers cannot make and will always resolve
against the operator. Protecting good correspondents from bad-network reviews is essential
to keeping them.

Ladder: warning → retraining module → suspension → removal. Immediate removal for filming
after being told to stop, covert filming, soliciting side payments, or any conduct at a
funeral that the family complains about.

## The fraud and failure modes worth pre-empting

| Risk | Mitigation |
| --- | --- |
| Correspondent takes payment, doesn't turn up | 3 h confirmation ping; auto-reassign; no-show forfeits fee and triggers review |
| Correspondent films 20 min, leaves, claims full duration | Telemetry records actual capture duration; payout is tied to it |
| Family and correspondent collude to book fake events for payouts | Payout requires ≥60% of booked duration captured with real motion and audio; new accounts capped; anomaly review on repeat pairs |
| Kit sold or "stolen" | Deposit or earn-out; device management on phase-2 kits; kit tied to the correspondent's verified identity |
| Correspondent shares the private stream link | Expiring signed tokens; correspondent app cannot view or copy the viewer link |
| Customer disputes the charge after a good stream | Delivered-quality telemetry and the recording are the evidence; refund policy below is generous enough that genuine disputes are rare |
| Recording leaks | Encrypted at rest, signed URLs, 12-month expiry, no public indexing |

## The refund policy, which is a marketing decision

**If we do not deliver the complete recording, the customer does not pay.** Full stop, no
arbitration, refunded automatically.

This is affordable precisely because of the store-and-forward architecture: the recording is
captured locally and will arrive even when the live stream fails badly. So we are guaranteeing
the thing we can nearly always deliver, while the live experience — the thing genuinely at the
mercy of a Congolese network on a given afternoon — is explicitly sold as best-effort.

Being able to make a strong promise about the outcome the customer cares most about, and an
honest one about the part we do not control, is worth more than any quality claim a
competitor can make. It also happens to be true, which makes it easy to say for years.

---

[^momo]: MTN MoMo and Airtel Money are the two dominant mobile money services in
Congo-Brazzaville, with inter-operator transfer available. <https://momocalc.com/congo>
