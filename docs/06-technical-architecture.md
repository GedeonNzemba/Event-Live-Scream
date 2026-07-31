# 06 — Technical architecture

## The design problem, stated precisely

Deliver an emotionally convincing sense of presence from a handheld device on a link that
may be 1.5 Mbps or 80 kbps or nothing at all, changing every few seconds, while running on a
battery that must survive a four-hour ceremony, to between one and fifty viewers on three
continents.

Every decision below follows from three commitments:

1. **The recording always arrives.** Live delivery is best-effort; the archive is guaranteed.
2. **Audio is the payload.** Video is an enhancement. Never sacrifice sound for pixels.
3. **Watching and talking are different products** and must not share a transport.

## Why the obvious streaming stack is wrong here

The default answer for "phone streams to viewers" is RTMP or SRT into a media server. Both
are wrong for this problem, and understanding why is most of the architecture.

**RTMP** runs over TCP with no application-level adaptation. On a lossy link, TCP's
congestion control collapses throughput, the encoder's output backs up, and the stream
either stalls or the server drops the connection. There is no concept of "deliver this
later." A dropout means the content is gone.

**SRT** is much better — UDP with selective retransmission — but it is fundamentally a
*live* protocol with a fixed latency budget. Packets that cannot be recovered within the
configured window are abandoned. That is exactly the right behaviour for a broadcast
contribution feed and exactly the wrong behaviour for a family archive, because SRT's
correct engineering decision is to throw away the twenty minutes when the network died.

**WebRTC** is right for conversation and wrong for everything else: it deliberately has no
retransmission budget worth the name, it does not buffer, and it scales to many viewers only
through an SFU that costs real money per participant.

What this problem actually needs is closer to **a resumable file upload that happens to be
live**: capture to durable local storage, then drain that storage opportunistically. Live is
what you get when the drain keeps up. That inverts the usual priority — and it is the single
most important architectural decision in the company.

```
CONVENTIONAL                          ELONGO
camera → encoder → network            camera → encoder → LOCAL DISK → uploader → network
         (network fails =                                    ↑
          content lost)                            content is safe here,
                                                   before the network is involved
```

## System overview

```
┌─ CONGO ──────────────────────────────┐   ┌─ CLOUD ──────────────┐   ┌─ DIASPORA ──────┐
│                                      │   │                      │   │                 │
│  Correspondent app (Android)         │   │  Ingest              │   │  Browser        │
│   ├ CameraX capture                  │   │   ├ segment receiver │   │   (no install)  │
│   ├ MediaCodec H.264 (hardware)      │   │   ├ reorder buffer   │   │                 │
│   ├ Opus audio 24–64 kbps            │   │   └ gap tracker      │   │   Watch mode    │
│   ├ CMAF segmenter (1 s chunks)      │   │                      │   │    LL-HLS       │
│   │                                  │   │  Live packager       │──▶│    5–15 s       │
│   ├ SEGMENT STORE (durable) ◀────────┼───┼─ LL-HLS + DVR        │   │                 │
│   │   audio & video tracks separate  │   │                      │   │   Talk mode     │
│   │                                  │   │  Archive assembler   │   │    WebRTC       │
│   ├ Priority uploader ───────────────┼──▶│   └ fills gaps late  │   │    <1 s         │
│   │   QUIC, resumable, multi-path    │   │                      │   │                 │
│   │                                  │   │  SFU (Talk mode)     │◀──┼──▶              │
│   ├ ABR controller ── ladder         │   │                      │   │                 │
│   ├ Power budget manager             │   │  Object storage      │   │  WhatsApp:      │
│   └ Dual SIM: MTN ∥ Airtel ∥ WiFi    │   │  Postgres · payments │   │  booking, links │
└──────────────────────────────────────┘   └──────────────────────┘   └─────────────────┘
```

## The capture client

The only piece of software anyone in Congo installs. Android only — iPhone share in the
market is negligible and the correspondent fleet is Android by definition. Target Android 10+
on 3 GB RAM devices, and build an APK under 15 MB because correspondents pay for their own
downloads.

### Separate audio and video tracks, always

Audio and video are encoded, segmented, stored and uploaded as **independent tracks**. This
sounds like a detail. It is the mechanism that makes the entire degradation ladder work:

- Dropping to audio-only is not a codec renegotiation or a stream restart. It is simply
  *pausing the video upload queue*. Instant, seamless, no handshake, no visible interruption.
- Audio can be prioritised ahead of video in the upload queue at all times.
- When bandwidth returns, video resumes and the missed video backfills into the archive while
  audio never stopped.

A conventional muxed stream cannot do any of this without tearing down and rebuilding the
connection — which is precisely the visible "reconnecting…" stall we exist to eliminate.

### The segment store

Every second of capture is written to local storage before any network operation:

```
/presence-8fa2/
  a/000001.m4s   a/000002.m4s   …    ← Opus, 1 s CMAF chunks, ~3–8 KB each
  v/000001.m4s   v/000002.m4s   …    ← H.264, 1 s CMAF chunks, 15–190 KB each
  manifest.jsonl                     ← append-only: seq, track, ts, bytes, sha256, state
```

Append-only, crash-safe, fsync'd on the manifest. If the app is killed or the phone dies,
restart replays the manifest and resumes. A four-hour ceremony at an average 600 kbps is
about 1.1 GB — comfortable on any modern handset, and segments are deleted only once the
server acknowledges them.

### Upload priority

Bandwidth is allocated in strict priority order, which is a two-dimensional decision (live
vs backfill, audio vs video):

| Priority | Class | Rationale |
| --- | --- | --- |
| 1 | Live-edge **audio** | The payload. 24 kbps gets through almost anything |
| 2 | Live-edge **video** | The enhancement, at whatever the ladder currently permits |
| 3 | Backfill **audio**, oldest first | Completes the archive's soundtrack |
| 4 | Backfill **video**, oldest first | Completes the archive's picture |

Backfill only consumes bandwidth left over after the live edge is satisfied, so filling in
the gap from twenty minutes ago never damages the stream happening now. When the event ends
and live demand stops, the entire remaining backlog drains at full speed.

### Transport

**HTTP/3 over QUIC.** Chosen deliberately over HTTP/2:

- **No head-of-line blocking.** One lost packet stalls one segment, not the whole connection —
  which matters enormously at the 2–8% loss rates typical of a congested African mobile cell.
- **Connection migration.** QUIC connections survive a change of network path, which is what
  makes seamless failover between MTN, Airtel and Wi-Fi possible without re-establishing TLS.
- **Faster recovery.** 0-RTT resumption after the frequent brief outages that characterise
  these links.

Each segment is a small, independently retriable PUT with a content hash. Idempotent, so a
retry after an ambiguous failure is always safe.

### Multi-path: dual SIM plus Wi-Fi

Coverage in Congo is patchy, and — the useful part — patchy *differently* per carrier. The
cell that is congested for MTN is frequently fine for Airtel.

The client continuously measures throughput, RTT and loss on every available path and
schedules each segment onto the healthiest one, splitting across paths when it needs the
headroom. Because segments are independent and idempotent, this requires no coordination
protocol — it is just a scheduling choice per object.

This is unglamorous engineering that produces a larger quality improvement than any codec
decision available to us, and it is one of the harder things for a competitor to copy.

### The degradation ladder

| Rung | Target | Video | Audio | Notes |
| --- | --- | --- | --- | --- |
| 0 | 1,500 kbps | 720p30 | 64 kbps | Good 4G, Brazzaville centre |
| 1 | 800 kbps | 480p24 | 48 kbps | Typical urban 4G |
| 2 | 450 kbps | 360p20 | 32 kbps | Busy cell / good 3G |
| 3 | 250 kbps | 240p15 | 32 kbps | Weak 3G |
| 4 | 150 kbps | 180p12 | 28 kbps | Congested 3G — see note below |
| 5 | 80 kbps | still every 4 s | 28 kbps | **The photo call** — sound plus a slideshow of faces |
| 6 | 24 kbps | none | 24 kbps | **Audio floor** — survives almost any GSM data link |
| 7 | 0 | none | none | **Buffered** — record locally, deliver later |

Rung 4 was not in the original design; the simulation put it there. The first
ladder stepped straight from 250 kbps to stills, and on the Pointe-Noire 3G
profile that 2× gap cost hours of live video on a link that could comfortably
have carried a small picture — live video presence went from 46% to 98% once the
rung was added. Ladder steps want to be roughly 1.6–1.9×; anything wider is a
hole customers fall into.

Two more rungs deserve comment.

**Rung 5** is underrated. Continuous audio plus a face every four seconds feels
surprisingly close to being there, at a bitrate that carries over connections which cannot
sustain video at all. Most systems have nothing between "bad video" and "failure"; this rung
occupies that gap.

**Rung 6** is the promise. At 24 kbps Opus, a family in Paris can hear a wedding — the
speeches, the drums, their name called across the room — on a link that no video call would
survive. Per [document 01](./01-problem.md), that is the emotional payload. A family that can
hear the wedding is at the wedding.

### The controller

Rung selection is asymmetric — **fall fast, climb carefully** — because a premature climb
causes a visible stall while a premature fall causes only a slightly softer picture that
nobody notices. Three rules matter more than the tuning constants, and each one replaced an
earlier version that the simulation proved wrong:

**Queue thresholds are fractions of the live window, never absolute seconds.** Watch mode
runs 15 seconds behind on purpose, and that buffer is not slack to be defended — it is what
the latency was spent on. A send queue four seconds deep is *healthy* when the deadline is
fifteen seconds away. An early version panicked at four seconds flat and spent entire events
pinned to the audio floor on links that could carry 480p, which threw away the whole
advantage of not being a video call. Degrade at 75% of the window, stop climbing at 45%.

**Loss is telemetry, not a control input.** On a wireless link most loss is radio error
rather than congestion — the rural EDGE profile sits at 10–15% loss while comfortably
carrying its nominal bitrate. Treating loss as congestion pinned the ladder to the floor on
exactly the links where the product matters most. Loss is already paid for in goodput, since
retransmissions consume capacity; counting it again double-charges a cost already absorbed.
**Queue depth is the honest congestion signal.**

**Throughput is only a measurement when the link was the limit.** Once the ladder drops to
audio-only, the client offers 24 kbps and will therefore measure 24 kbps forever, however
much capacity returns — so it never climbs back, and the family listens to a wedding they
could have watched. The uploader reports whether it emptied the queue with capacity to
spare; when it did, the throughput sample is treated as a *lower bound* and probed upward at
about 6% per second. Relatedly, an outage is not a bandwidth sample at all: freeze the
estimate through a dropout rather than decaying it, or the client spends minutes crawling
back from zero after every brief loss of signal.

Plus the ordinary machinery: a cooldown so the picture does not oscillate (more irritating
to watch than a consistently lower resolution), a floor on how fast rungs can be shed, and a
climb that jumps straight to the rung the estimate supports rather than stepping up one at a
time — after a twenty-minute blackout, stepping would take minutes to recover.

### Power budgeting

The client knows what a video call never does: the battery percentage *and how long the event
is booked for*. So it can plan.

```
remaining_wh          = battery_pct × capacity_wh
seconds_remaining     = booked_end − now
required_budget_w     = remaining_wh × 3600 / seconds_remaining
```

It then picks the highest ladder rung whose projected draw fits `required_budget_w`, and
applies power measures in increasing order of user impact:

1. **Screen off / preview disabled** — usually the single largest draw, and costs the
   correspondent almost nothing since they are looking at the event, not the phone.
2. **Frame rate before resolution** — 30→20 fps saves roughly a third of encode power and is
   far less noticeable than a resolution drop.
3. **Ladder rung down.**
4. **Radio duty-cycling** — batch uploads into bursts rather than a continuous trickle;
   keeping the radio in a high-power state continuously is expensive.

One non-obvious term belongs in the model: **transmit power scales sharply with poor signal
strength.** A phone on a weak cell can burn several times more energy to send the same bits.
So a weak signal is doubly punishing — less throughput *and* faster battery drain — which is
exactly the situation where a naive system fights hardest and dies soonest. The power model
must read signal strength, not just bitrate.

And the whole thing is a communication feature. This message:

> *Mode économie d'énergie — audio et photos. Batterie suffisante pour les 90 minutes
> restantes.*

is a service managing a known constraint. A call that dies without explanation is a failure.
Same physics, opposite customer experience. **Managing scarcity visibly is the product.**

## Talk mode

A separate, deliberate, announced sub-session — not a mode the system drifts into.

A viewer requests the floor. The correspondent gets a clear prompt ("Sylvain wants to say a
word"), accepts, and walks to the couple. The client opens a WebRTC connection to an SFU
alongside the ongoing segmented upload, the viewer's audio plays through the phone speaker,
and the room answers. Ninety seconds later it closes and Watch mode carries on
uninterrupted — the archive never had a gap, because the segment pipeline never stopped.

Constraints, enforced in product rather than left to chance: one speaker at a time, a default
90-second limit with a visible countdown, a hard requirement that the correspondent accepts,
and automatic decline of real-time *video* when the ladder is at rung 3 or below. There is no
point attempting an interactive video connection alongside a Watch stream on a link already
struggling to carry 250 kbps; offer real-time **audio** instead, which works far further down
and delivers the thing the viewer actually wants — to be heard in the room.

Talk mode is also a pricing lever. It is the expensive mode, it is what people most want, and
metering it is natural and non-annoying: three floor-requests included, more available as an
add-on.

## Server side

**Ingest** accepts segments out of order, from multiple network paths, possibly hours late.
It tracks per-presence gaps and exposes completeness as a first-class metric — this is what
backs the refund guarantee in [document 05](./05-operations.md).

**Live packaging** produces LL-HLS with partial segments, giving 5–15 s glass-to-glass — well
within tolerance for passive watching, and the tolerance is precisely what buys the
resilience. A DVR window lets a viewer who joins late rewind to the start, which matters more
than it sounds: relatives across five time zones do not all join on time.

**Archive assembly** stitches the complete recording once the backlog drains, generates the
auto-highlight (loudest moments, most faces, most motion — a crude heuristic that works
adequately for a three-minute reel), and extracts still photos.

**Delivery** through a commodity CDN. Egress is genuinely cheap at these bitrates: a 3-hour
Fête at 600 kbps is ~0.8 GB per viewer, so nine viewers is ~7 GB, which is cents.

**Talk mode SFU** — LiveKit or mediasoup, in a European region. Used in bursts, so it can be
scaled aggressively and shared across concurrent presences.

## Build versus buy

Deliberately narrow. Build only what is differentiating; rent everything else.

| Component | Decision | Why |
| --- | --- | --- |
| Capture client, segment store, ladder, power manager | **Build** | This is the entire moat. Nothing off the shelf does store-and-forward with an audio floor |
| Multi-path scheduler | **Build** | Specific to dual-SIM African conditions |
| Ingest & completeness tracking | **Build** | Tied to the guarantee, and to the payout rules |
| Transcode, packaging, CDN | **Buy** | Commodity. Mux, Cloudflare Stream or ffmpeg on cheap compute |
| SFU for Talk mode | **Buy** | LiveKit Cloud until volume justifies self-hosting |
| Payments (diaspora side) | **Buy** | Stripe, plus SEPA debit for FR/BE contributors |
| Mobile money payouts | **Buy** | MTN MoMo and Airtel Money APIs, or an aggregator |
| WhatsApp messaging | **Buy** | WhatsApp Business Platform |

## Infrastructure cost at 1,000 presences per month

| Line | Monthly |
| --- | --- |
| Ingest + transcode compute | €180 |
| Object storage (~1.5 TB rolling, 90-day) | €30 |
| CDN egress (~9 TB) | €190 |
| SFU (Talk mode bursts) | €120 |
| Database, queues, monitoring | €90 |
| WhatsApp Business messaging | €140 |
| **Total** | **≈ €750 → €0.75 per presence** |

Infrastructure is not the constraint in this business; the operator fee is, at roughly 25× the
infrastructure cost. That has a strategic implication worth internalising: **do not optimise
cloud spend, optimise operator utilisation.** An hour of correspondent time saved is worth
more than any amount of encoding efficiency.

## Security and privacy

- Segments encrypted in transit (TLS 1.3) and at rest.
- Viewer access by short-lived signed tokens tied to a presence and revocable individually.
- No public discovery surface of any kind. Nothing is indexable.
- Recordings expire at 12 months unless an archive is purchased.
- Deletion on request from **the filmed family**, not only the paying customer — see
  [document 05](./05-operations.md).
- GDPR applies via the EU customer relationship: DPA, records of processing, EU data
  residency, documented lawful basis. The filmed subjects in Congo are data subjects too, and
  the consent flow in document 05 is the operative control.
- Correspondent identity documents kept encrypted, access-logged, and separated from the
  operational database.

## The prototype

[`prototype/`](../prototype) implements the parts of this document that carry the risk — the
ladder controller, the power budget, the segment store, the priority uploader and the
completeness accounting — and runs them against simulated Congolese network profiles.

It exists to answer one question before any money is spent on a mobile team: *does this
design actually hold audio continuity and recording completeness under realistic conditions?*
The tests assert that it does.
