# 01 — The problem

## The scenario, taken literally

Sylvain lives in France. His family is in Brazzaville. When there is a wedding, a
baptism, a birthday or a funeral, someone at home starts a WhatsApp video call so he can
be present. Sometimes it works. Usually one of these happens instead:

- the connection breaks up or drops entirely;
- the phone is nearly flat because the power was out the day before, and the family is
  afraid it will die two minutes into the call;
- the call is granted, but rationed — "ten minutes, no more, the battery";
- the request is simply declined, because the person needs their phone.

The instinct is to treat this as one problem with one cause: bad internet in Africa. That
instinct will produce the wrong company. Only the first bullet is about the internet.

## Four constraints, not one

**1. Network.** Congo-Brazzaville has 6.33 million mobile connections against a population
of roughly 6.4 million, but only 38.4% of people use the internet and only 66.8% of those
connections are 3G or better.[^dr] Coverage is concentrated in Brazzaville and Pointe-Noire;
in Kouilou, Niari or the Pool, an event can easily sit on an EDGE cell. Crucially the
*uplink* is the binding constraint — mobile networks are engineered for people downloading,
not for a phone pushing 1.5 Mbps of video out of a crowded compound for three hours. This
is a real constraint but it is the one everybody sees, and it is the one that is slowly
fixing itself as 4G and 5G roll out.

**2. Power.** 51.3% of the population has access to electricity, and access is not the same
as supply — households connected to the grid still lose it for hours or days.[^wb] The
household's phone is therefore not just a phone. It is the family's single most important
*battery*: a torch, an alarm clock, a radio. Spending 40% of it on a video call is a
genuine sacrifice with consequences that last until the power comes back. The family's
refusal is not reluctance, it is arithmetic.

**3. Device contention.** The phone that would be the camera is the same phone that holds
their mobile money wallet, their WhatsApp, their photographs and their contacts. Congo has
roughly one mobile connection per person but far fewer smartphones; the household's good
Android is shared. Handing it over to be a tripod for two hours means the owner is
disconnected and unbanked for two hours, at exactly the moment — a wedding, a funeral —
when everyone is calling them.

**4. Human labour.** This is the constraint nobody names, and it is the one that most often
kills the call. Somebody has to *hold the phone*. For the entire event. Standing up, arm
raised, pointing it at whatever Sylvain asks to see, narrating, turning it around,
answering "can you go closer?" — while the wedding, the meal and the dancing happen without
them. It is unpaid, tedious, socially costly work, and it is asked of the youngest person
present. "I'm busy with it" is the polite version of "you are asking me to work as your
cameraman at my own sister's wedding."

## Why the obvious solutions have already failed

**"Just use a better app."** The best video codec in the world does not charge a phone,
and does not hold itself up. Three of the four constraints are untouched.

**"Send the family a phone."** A second handset in Congo without a data plan, without a
charged battery and without someone willing to operate it is a paperweight. Within a month
it has been absorbed into household use, which is the correct decision for the household
and a total loss for Sylvain.

**"Hire a videographer."** This exists, and it works — for weddings. Lagos, Nairobi, Accra
and Johannesburg all have professional outfits streaming ceremonies for diaspora
families.[^kenya] They charge professional prices, they are booked locally and paid locally
in cash, and they turn up with a crew for a wedding. None of that reaches a Tuesday evening
birthday, a baptism, a child's first day of school, or a grandmother who simply wants to be
seen. The whole middle of family life — the frequent, small, unimportant-looking events that
are actually the substance of a relationship — is unserved.

**"Wait for infrastructure."** Connectivity is improving; Congo launched 5G and is running a
rural connectivity programme.[^conn] But power is improving far more slowly, device
contention is an income problem, and the labour problem does not improve with infrastructure
at all. A family member will still not want to spend a wedding holding a phone in 2035.

## The reframe, stated plainly

> **The scarce resource is not bandwidth. It is a device, a charge, a data bundle and a
> willing pair of hands, physically present at the event.**

That bundle costs very little in euros and is nearly unobtainable in the moment by anyone
in Brazzaville. It is trivially affordable to Sylvain, who cannot buy it because no one
sells it.

That gap — a thing that is cheap in Paris, unavailable in Brazzaville, and desperately
wanted by both ends of the same family — is the business.

## The asymmetry that makes it work

| | In France | In Congo |
| --- | --- | --- |
| Money | Available. €30 is an evening out | Scarce. €30 is meaningful income |
| Time & presence | Unavailable. Cannot fly home for a birthday | Available. The event is happening anyway |
| Devices, power, data | Abundant | Scarce and contested |
| Youth labour | Expensive | Abundant and underemployed |

Every row points the same direction. Money and demand sit on one side; time, presence and
labour sit on the other. A marketplace that converts euros into a local operator's hour is
pushing with the gradient, not against it. The same €30 that buys Sylvain a mediocre pizza
buys a young person in Brazzaville half a day's respectable income *and* buys Sylvain his
mother's wedding.

## Who else is Sylvain

Sylvain is not one customer, and this is the most commercially important fact in the
document. A Congolese wedding or *matanga* has ten to fifty relatives abroad — France,
Belgium, the UK, the US, Canada, South Africa. Each of them currently makes their own
separate request to the same family in Congo. Each request is separately refused for the
same four reasons.

They already coordinate. Diaspora families run WhatsApp groups to organise funerals and
collect contributions by mobile money.[^drc] The group exists, the payment habit exists, the
occasion exists. Nobody has attached a camera to it.

That is the difference between a videography business — one job, one client, linear labour —
and a platform: **one capture, one cost, many payers.**

## What emotional job is being bought

Worth being precise, because it determines the pricing and the product.

Sylvain is not buying video. He is buying **evidence that he still belongs to his family.**
The failure mode he actually fears is not a pixelated stream; it is the slow accumulation of
missed events until his nieces do not know him, and he is a name that sends money at
Christmas. Migration researchers call this the maintenance of transnational family ties; the
family calls it not becoming a stranger.

Two consequences follow:

1. **Audio matters more than video.** Hearing your mother's voice, the drums, the singing,
   your name being called out across the room — that is the payload. A 240p picture with
   clean audio is a good experience. A crisp picture with broken audio is worthless. This is
   an architectural instruction, and it is in [document 06](./06-technical-architecture.md).

2. **Being seen matters as much as seeing.** Sylvain wants to be *acknowledged at* the
   event — for the room to turn and greet him, for him to say a word at the toast. That is a
   different technical product from watching, it is needed for ninety seconds not ninety
   minutes, and separating the two is the core design insight of
   [document 02](./02-solution.md).

## The failure that ends the relationship

One more thing the current situation does badly, and it deserves its own heading because it
is the strongest emotional lever in the business.

When a WhatsApp call drops at a funeral, the moment is gone. There is no recording. Nobody
in the room is going to re-stage the eulogy. The diaspora member gets a fragment, a
frustration, and a permanent absence from the family record.

Any system that *records locally first* and uploads whenever it can — even hours later —
converts the worst outcome (nothing, forever) into a merely imperfect one (everything,
late). That is not a nice-to-have feature. For a funeral it is the entire value
proposition, and it is technically straightforward for anyone who decides it is the
priority. No one has.

---

[^dr]: DataReportal, *Digital 2025: The Republic of the Congo* — 2.46m internet users
(38.4% penetration), 6.33m cellular connections (98.7% of population), 66.8% of connections
3G/4G/5G. <https://datareportal.com/reports/digital-2025-republic-of-the-congo>

[^wb]: World Bank, *Access to electricity (% of population) — Congo, Rep.*: 51.3% (2023),
up from 48.7% in 2020. <https://data.worldbank.org/indicator/EG.ELC.ACCS.ZS?locations=CG>

[^kenya]: *Daily Nation*, "Entrepreneur from Nakuru County cashing in on streaming weddings
and burials" — Atesh Graphics streams Kenyan events to viewers in the US, Germany, UK, Saudi
Arabia and Dubai. <https://nation.africa/kenya/business/enterprise/entrepreneur-from-nakuru-county-cashing-in-on-streaming-weddings-and-burials-3379230>

[^conn]: Connecting Africa, "Congo boosts Internet access in rural areas" — 20 rural
connectivity sites under the Projet d'Accélération de la Transformation Numérique (PATN).
<https://www.connectingafrica.com/connectivity/congo-boosts-internet-access-in-rural-areas>

[^drc]: France 24, "In DR Congo, cost of funerals is a crippling burden for the bereaved" —
families turn to diaspora relatives; WhatsApp groups coordinate programmes and collect
mobile-money contributions. <https://www.france24.com/en/20180120-dr-congo-cost-funerals-crippling-burden-bereaved>
