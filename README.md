# Elongo

*Elongo* means **"together"** in Lingala.

**Presence-as-a-service for the African diaspora.** When there is an event back home —
a wedding, a baptism, a birthday, a *matanga* — Elongo puts a camera, a battery, a data
bundle and a pair of hands at that event, so the family abroad can be there without
anyone at home having to sacrifice their phone, their battery, or their evening.

---

## The reframe

The obvious reading of Sylvain's problem is "WhatsApp video calls from Congo are bad."
That reading leads to building a better video codec, and it is wrong.

Read the scenario again and count the refusals. Only one of them is about the network:

| What the family actually says | The real constraint |
| --- | --- |
| "The connection keeps cutting" | **Network** — the Congo-side uplink is weak and variable |
| "The phone is at 15%, there was no electricity yesterday" | **Power** — the grid failed, and the phone is the only battery in the house |
| "I need my phone, I'm busy with it" | **Device** — that phone is their bank, their music, their contacts. Lending it as a camera means losing all of it |
| "OK but only for ten minutes" | **Labour** — someone must stand and hold a phone, pointing it at things, for the whole event, instead of attending it |

Three of the four have nothing to do with video quality. WhatsApp already gives away
video calls for free and it still does not work — because **the scarce resource is not
bandwidth, it is a device, a charge, a data bundle, and a willing human at the point of
capture.** That bundle is precisely what a person in France can afford and cannot buy.

So Elongo does not compete with WhatsApp. Elongo removes the four reasons the WhatsApp
call gets refused.

## What we sell

For the duration of an event, the diaspora rents a **capture unit** at that event:
a device that is not the family's phone, a battery that does not depend on the grid,
a data bundle nobody at home pays for, and a trained local operator whose *job* is to
hold the camera — so no relative has to.

One capture, many viewers. A Congolese wedding has ten to fifty relatives abroad across
France, Belgium, the UK, the US and Canada. Today each of them separately begs for a
video call, and each request is a separate imposition on the same exhausted family
member. Elongo captures once and delivers to all of them, and they split the cost.

## The technical bet

Two claims, both testable, both implemented in [`prototype/`](./prototype):

1. **Never fail to deliver the memory, even when you fail to deliver it live.**
   Every second captured is written to local storage first and uploaded opportunistically.
   The network can die for twenty minutes; the recording is still complete. Sylvain always
   gets the whole event — sometimes four seconds late, sometimes four hours late, never not
   at all. Existing tools drop the call and the moment is gone forever.

2. **Watching and talking are different products and should not be priced the same.**
   WhatsApp charges you sub-second interactive latency for the entire event, even during
   the ninety minutes you are just watching people dance. Elongo runs a cheap, resilient
   **Watch mode** by default and switches to expensive real-time **Talk mode** only for the
   moments that need it — the toast, the blessing, the greeting. That single split is what
   makes a three-hour ceremony survivable on a Congolese uplink and on a battery.

The prototype simulates full events over Congo-like network profiles and measures both.
**Recording completeness is 100% on every profile**, including through a twenty-minute total
blackout. Live presence varies honestly with conditions: on a good Brazzaville 4G cell a
conventional call is already fine and we add nothing, while on 3G the live picture goes from
79% to 98% and on rural EDGE from 13% to 66%. In the wedding worst case — a congesting cell
plus a blackout across the speeches — the family hears 89% of the event live and receives
100% of it afterwards, against a conventional call that drops 22 times and leaves no
recording at all.

```bash
cd prototype && npm test        # the guarantees, as assertions
cd prototype && npm run demo    # simulate a 3-hour wedding on a bad link
```

## The documents

Read in order; each one assumes the previous.

| # | Document | What it answers |
| --- | --- | --- |
| **00** | **[How it works](docs/00-how-it-works.md)** | **Start here.** One wedding, start to finish, in plain language |
| 01 | [Problem](docs/01-problem.md) | Why this is a resource-and-labour problem, not a connectivity problem |
| 02 | [Solution](docs/02-solution.md) | What the product actually is, and the Watch/Talk split |
| 03 | [Business model](docs/03-business-model.md) | Pricing, unit economics, the family-pool multiplier, the payments endgame |
| 04 | [Market & competition](docs/04-market-and-competition.md) | Corridor sizing and why the incumbents cannot reach this customer |
| 05 | [Operations](docs/05-operations.md) | The correspondent network: recruiting, paying and trusting local operators |
| 06 | [Technical architecture](docs/06-technical-architecture.md) | The full system design |
| 07 | [Roadmap & validation](docs/07-roadmap-and-validation.md) | What to build when, and how to test the thesis in 30 days for under €500 |
| 08 | [Risks](docs/08-risks.md) | What kills this business, and what to do about it |

## Where to start tomorrow

Do not write product code first. [Document 07](docs/07-roadmap-and-validation.md) sets out a
30-day, sub-€500 validation: run ten events manually, by hand, with one paid cousin in
Brazzaville and a WhatsApp group. If ten diaspora families will not pay €25 for a
hand-operated version, they will not pay for a polished one, and you will have learned
that for the price of a weekend instead of a year.

## A note on the repository name

This repository is called `Event-Live-Scream`. Assuming that is a typo for *Stream*, it is
worth fixing before anything is public: a meaningful share of the events this serves are
funerals, and a brand containing the word "scream" would be an unforced error in a market
where you are asking families to trust you with a death in the family. `Elongo` is offered
as a working name — Lingala for *together*, pronounceable in French, English and Kituba,
and unclaimed as a trademark in the relevant classes as far as a founder-level search goes.
Verify properly before printing anything.
