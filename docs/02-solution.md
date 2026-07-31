# 02 — The solution

## One sentence

**Elongo rents the diaspora a camera, a battery, a data bundle and a pair of hands at a
family event in Africa, for as long as the event lasts.**

Not an app for making video calls. A service that shows up.

## The unit of sale

Everything in this business is organised around one object: **the Presence**.

A Presence is a booked block of time at a named event, at a named place, with a named
operator, delivered to a named set of viewers. It has a start, a duration and a price. It
is the thing the diaspora buys, the thing the operator is paid for, and the thing the
platform measures.

```
PRESENCE
  event      "Mariage de Grace & Thierry"
  place      Makélékélé, Brazzaville
  when       Sat 14 Mar, 14:00–18:00 WAT
  operator   Merveille N. (rated 4.9, 61 presences)
  kit        phone + 20 000 mAh pack + 6 GB dual-SIM bundle
  viewers    9 across FR (4), BE (2), UK (1), CA (1), US (1)
  price      €89, split 9 ways → €9.89 each
  outputs    live stream · full recording · 3-min highlight reel
```

Read that block against the four constraints from [document 01](./01-problem.md). The
operator is not a relative, so nobody loses their evening. The kit is not the family's
phone, so nobody loses their wallet. The battery pack is not the household's, so nobody
rations. The data is bought by us, so nobody at home pays. And the price is split nine
ways, so nobody in France is buying it alone.

## The core design insight: watching and talking are different products

This is the idea the company is built on, so it gets its own section.

A WhatsApp video call is a **symmetric, sub-second, interactive** connection. That is the
right technology for a conversation and a wildly wrong technology for attending a wedding.
Interactive latency is the most expensive thing you can ask of a bad network: it forbids
buffering, so every hiccup is visible; it forbids re-sending lost packets, so every loss is
a glitch; and it forces the encoder to stay responsive, which costs battery. WhatsApp makes
you pay that price for all three hours, including the ninety minutes where Sylvain is just
watching people dance and would not notice — or care — if the picture were eight seconds old.

Elongo splits it:

| | **Watch mode** (default, ~95% of an event) | **Talk mode** (on request, in bursts) |
| --- | --- | --- |
| What it is for | Being present. Watching, listening, absorbing | Being *acknowledged*. Speaking to the room, greeting, the toast |
| Latency | 5–15 seconds. Nobody notices | Sub-second. Required for conversation |
| Transport | Segmented HTTP upload, buffered, retried | WebRTC, peer-ish, no retries possible |
| Behaviour on a bad link | Degrades smoothly, buffers through gaps, never loses content | Degrades badly; this is the mode that "cuts out" |
| Bandwidth | 150 kbps – 1.5 Mbps adaptive, with a hard floor | ~500 kbps sustained, non-negotiable |
| Battery cost | Low. Can be tuned down further | High |
| Viewers | Scales to hundreds for the same uplink cost | Practically one or two |
| Cost to serve | Cents | Meaningfully more |

Because Watch mode tolerates delay, it can **buffer**. Because it can buffer, it can survive
a 20-second dropout invisibly and a 20-minute dropout recoverably. That is the entire
difference between "the call keeps cutting" and "we were there for the whole thing."

Talk mode is then a deliberate, announced, ninety-second event: *"Sylvain wants to say a
word."* The operator walks the camera to the couple, the app switches to real-time, Sylvain
speaks, the room answers, and it switches back. He gets the thing he actually wanted — to be
acknowledged in the room — and it costs ninety seconds of hard bandwidth instead of three
hours.

## The second insight: never lose the memory

Every second the camera captures is written to the device's local storage **before** any
attempt to send it. Upload is a separate, opportunistic process that drains that queue
whenever the network permits, in priority order, and resumes after any interruption.

Consequences:

- The network can fail completely for twenty minutes. The live viewers see a held frame and
  an honest status message. When it returns, live catches up and the missing twenty minutes
  upload in the background. **The recording is complete.**
- The event can happen in a village with no usable data at all. Nothing is live. The
  operator drives back to town, and by evening the family abroad has the entire ceremony.
  This turns the worst-covered 60% of the country from "impossible" into "next-day", which
  is a market expansion, not a compromise.
- The phone can die. Everything captured up to that second is already on disk and uploads
  when it charges.

For a wedding this is a nice guarantee. **For a funeral it is the whole product.** A dropped
WhatsApp call at a burial destroys a moment that will not be repeated. Being able to promise
a grieving family in Paris "you will receive the whole ceremony, and if the network is bad
you will receive it late, but you will receive it" is a promise nobody currently makes, and
it is worth more than any amount of picture quality.

Both guarantees are implemented and tested in [`prototype/`](../prototype).

## The degradation ladder

When bandwidth falls, most systems eventually give up and drop the connection. Elongo has a
floor it never goes below while the device has power:

```
  1.5 Mbps ······  720p30   ← good 4G in Brazzaville
  800 kbps ······  480p24
  450 kbps ······  360p20
  250 kbps ······  240p15
  150 kbps ······  180p12
   80 kbps ······  audio + a still image every 4 s   ← the "photo call"
   24 kbps ······  audio only (Opus)                  ← survives almost any GSM data link
       0 kbps ····  buffered: record locally, deliver later
```

The rung that matters is **audio-only at 24 kbps**. Twenty-four kilobits per second gets
through conditions that no video call survives. And per [document 01](./01-problem.md),
audio is the emotional payload — hearing the drums, the singing, your mother's voice, your
name called across a room. A family that can hear the wedding is at the wedding. A family
staring at a frozen "reconnecting" spinner is not.

Above the audio floor sits a rung worth naming separately: **audio plus a still every four
seconds**. At 80 kbps you get continuous sound and a slideshow of faces. It feels
surprisingly close to being there, and it works on connections that cannot carry video at
all.

## Power-aware capture

The app knows two things a video call does not: the battery percentage, and **how long the
event is booked for**. So it can budget.

If a four-hour ceremony starts with 60% charge and no mains power, the app computes that it
cannot sustain 480p to the end, and *pre-emptively* drops to 360p and disables the local
preview screen (the screen, not the radio, is usually the largest draw). It reaches the end
of the ceremony. The alternative — full quality for two hours and then nothing — is strictly
worse, and it is what every existing tool does.

This is also a communication feature. Telling the family in France:

> *Power-saving mode. Audio and stills. Battery is good for the remaining 90 minutes.*

is completely different from a call dying without explanation. The first is a service
managing a known constraint. The second is a failure. **Managing scarcity visibly is the
product.** The customer's real anxiety is uncertainty, not low quality.

## Connectivity we control

Two decisions remove connectivity from the family's shoulders entirely.

**We buy the data.** The operator's bundle is purchased by the platform and priced into the
booking. No relative is ever asked to spend their own airtime, and the operator never has to
choose between the gig and their credit. This sounds like a small operational detail; it is
the difference between an operator network that works and one that quietly stops answering.

**Dual-SIM by default.** Every kit carries both MTN and Airtel. Coverage in Congo is patchy
and, importantly, patchy *differently* per carrier — the cell that is congested for one is
frequently fine for the other. The app measures both continuously and sends over whichever
is healthier, or splits across both when it needs the headroom. This is unglamorous and it
produces a larger quality improvement than any codec choice available to us.

## Distribution: WhatsApp is the front door, not the enemy

Congolese families already live in WhatsApp; it is where funerals are organised and
contributions collected. Fighting that is how this company dies.

So: **booking, invitations, reminders and the viewing link all travel through WhatsApp.**
The diaspora viewer clicks a link and watches in their browser. No app install, no account,
no password — friction at that moment costs conversion, and the moment is emotionally
loaded. The only person who installs software is the operator, who is paid to.

## Service tiers

| Tier | Duration | Typical use | Includes | Price (guide) |
| --- | --- | --- | --- | --- |
| **Appel** | 30 min | Grandmother's birthday, a greeting, a school result | Live + recording | €15 |
| **Fête** | up to 3 h | Birthday party, baptism, engagement, homecoming | Live + recording + 10 photos | €39 |
| **Cérémonie** | up to 8 h | *Dot*, church wedding, *matanga*, *retrait de deuil* | Live + recording + auto-generated 3-min highlight + 30 photos | €89 |
| **Grand Événement** | 2–3 days | Full wedding, major funeral | 2 operators, multi-segment, edited film | €250–450 |

Pricing rationale, the split-payment mechanic and the full unit economics are in
[document 03](./03-business-model.md). The short version: these prices look high against a
free WhatsApp call and cheap against a €900 flight, and after a family pool splits a
`Cérémonie` nine ways it is €9.89 a head — less than each of those nine people already
spends on a single failed attempt to be there.

## What we deliberately do not build

- **A social network.** No feed, no followers, no public content. These are private family
  moments and the trust cost of getting that wrong is unrecoverable.
- **A general live-streaming platform.** Not competing with YouTube Live. Every design
  choice is specialised for one uplink profile and one emotional occasion.
- **Our own money-transfer licence — yet.** The contribution rail in
  [document 03](./03-business-model.md) is the long game, but it rides on a licensed partner
  until volume justifies otherwise. Regulatory drag would kill the company before product
  ever got a chance.
- **Hardware, in year one.** The first version runs on Android phones the operators already
  own. Custom kits come in phase two when the volume justifies the capital, and are
  discussed in [document 07](./07-roadmap-and-validation.md).
