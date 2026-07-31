# The presence engine

A runnable simulation of the capture pipeline described in
[docs/06-technical-architecture.md](../docs/06-technical-architecture.md).

It exists to answer one question before anybody spends a year building a mobile app:
**does this design actually hold audio continuity and recording completeness under
realistic Congolese network conditions, on a battery that has to last the whole ceremony?**

No dependencies. Node 22.18+ (for built-in TypeScript execution and the test runner).

```bash
npm test          # the guarantees, as assertions
npm run demo      # simulate a 3-hour wedding on a bad link
npm run demo:all  # every network profile, side by side
node src/cli.ts --list
node src/cli.ts pointe-noire-3g --hours=4 --battery=30
```

## What it models

| Piece | File | What it does |
| --- | --- | --- |
| Link | `src/link/` | Per-second uplink: slow drift, congestion as a venue fills, jitter, scheduled blackouts, random micro-dropouts |
| Ladder | `src/encoder/ladder.ts` | The eight quality rungs, from 720p30 down through stills to audio-only |
| Controller | `src/encoder/controller.ts` | Chooses a rung each second from queue depth and a probed bandwidth estimate |
| Power | `src/power/budget.ts` | Projects battery to the booked end time and caps quality to reach it |
| Store | `src/pipeline/store.ts` | The durable segment store — capture lands here before any network attempt |
| Uploader | `src/pipeline/uploader.ts` | Priority-scheduled resumable upload: live audio, live video, backfill audio, backfill video |
| Baseline | `src/baseline.ts` | A conventional real-time video call on the identical link, for comparison |

## Results

Three-hour event, phone starting at 55%, seed 20260731:

| Link profile | heard | saw | archive | — a normal call — heard | saw | archive |
| --- | --- | --- | --- | --- | --- | --- |
| Brazzaville 4G, daytime | 100% | 100% | **100%** | 99.8% | 99.8% | 0% |
| Brazzaville 4G, evening peak | 100% | 100% | **100%** | 99.1% | 99.1% | 0% |
| Pointe-Noire 3G | 100% | 98.2% | **100%** | 97.8% | 79.4% | 0% |
| Rural Congo, EDGE | 93.6% | 66.0% | **100%** | 86.6% | 13.3% | 0% |
| Wedding day, worst case | 88.9% | 88.6% | **100%** | 87.2% | 87.2% | 0% |

*heard* and *saw* are the share of the event received live as sound and as a fresh picture.
*archive* is the share that reached the family's permanent recording.

Read these honestly:

- **On a good link, a conventional call is fine and we add nothing live.** Row one is not a
  win and should not be sold as one.
- **The live advantage appears where the customer actually lives** — a congested cell, rural
  coverage, a blackout during the speeches. On 3G, live picture goes from 79% to 98%; on
  EDGE, from 13% to 66%.
- **The archive column is the real product.** It is 100% in every condition and 0% for a
  real-time call in every condition, because a real-time call does not make a recording. In
  the wedding scenario the conventional call also drops 22 times and loses 16m30s waiting
  for somebody at a wedding to notice and call back.

The wedding profile is the one to look at: good signal as the ceremony opens, the cell
degrading as two hundred guests arrive and start posting, then a twenty-minute total
blackout across the speeches, then partial recovery for the dancing.

```
  quality over time  ▆▆▇▇▆▇▆▇▇▇▇▇▆▇▇▇▆▆▆▆▆▆▄▄▄▄▄▄▄▃▄▃▃▃▃▃▁▁▁▁▁▁▁▁▁▃▃▃▃▄▄▄▄▄▄▄▄▄▄▄▄▄▆▆▆▆▆▆▆▆▆▆
                      start                                                          end
```

Every second of that trough was still captured, and all of it was delivered.

## What the simulation changed about the design

The point of building this before the app was to find the design errors while they were
still cheap. Four of them were load-bearing:

1. **The ladder had a hole.** Stepping straight from 250 kbps to stills cost hours of live
   video on 3G links that could easily have carried a small picture. Adding a 180p12 rung at
   150 kbps took Pointe-Noire live video from 46% to 98%.

2. **Panicking at a fixed queue depth defeats the whole architecture.** Thresholds have to
   be fractions of the live window. Watch mode buys 15 seconds of latency precisely so it
   can absorb a stall; degrading at a four-second queue spends that buffer on nothing.

3. **Loss is a terrible congestion signal on wireless.** Rural EDGE runs at 10–15% radio
   loss while carrying its nominal bitrate fine. Treating that as congestion pinned the
   ladder at the floor for entire events. Queue depth is the honest signal; loss is
   telemetry.

4. **A controller cannot measure bandwidth it is not using.** At the audio floor the client
   offers 24 kbps, measures 24 kbps, and concludes the link is 24 kbps — forever. Without
   explicit probing when the queue drains, quality never recovers after a dropout.

Plus three smaller ones the tests caught: the warmup path skipped the power cap, so a nearly
flat phone would open at 480p; the emergency power path left the preview screen on when it
should have been the first thing killed; and the photo-call rung drew more power than the
better rung above it, which would have made the budget manager choose badly.

## The tests are the business promises

`test/guarantees.test.ts` asserts what [docs/05-operations.md](../docs/05-operations.md)
sells:

- The archive reaches 100% on **every** profile, including through a twenty-minute total
  blackout, and including content captured while the network was completely gone.
- Capture never stops because the network stopped.
- Audio survives better than video on a starved link, and the audio archive is never
  incomplete.
- A four-hour ceremony completes on a phone at 35%.
- A phone at 20% cannot do four hours — that is physics — but the €18 power bank in the
  correspondent kit turns it into a routine booking, and when the battery genuinely cannot
  last, everything captured before it died is still delivered.

That last group is why the refund policy ("if we do not deliver the complete recording, you
do not pay") is safe to offer: we are guaranteeing the thing the architecture nearly always
delivers, while being honest that the live experience depends on a Congolese network on a
given afternoon.

## What it does not model

Worth being explicit, because these are the next risks rather than solved problems:

- **Real encoders.** Bitrates are targets, not rate-control behaviour. Real H.264 overshoots
  on motion, and a dancing crowd is the worst case.
- **Dual-SIM bonding.** The single biggest planned quality lever is not simulated here. It
  should be modelled next, since it is also the hardest thing for a competitor to copy.
- **Server-side anything.** Ingest, packaging and CDN are assumed to work.
- **Talk mode.** WebRTC has completely different failure characteristics and needs its own
  study.
- **Real measurements.** The link profiles are engineering approximations shaped by
  published aggregates, not traces from Brazzaville. **Replace them with real captures as
  soon as any exist** — they are the test fixture, and every number above inherits their
  assumptions.
