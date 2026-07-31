# 09 — Platforms and clients

*Where the video actually lives, what we own, and what people watch it on.*

## The short answer

**No. Not WhatsApp, and not YouTube.** Those appear exactly once in this repository — in the
thirty-day concierge validation in [document 07](./07-roadmap-and-validation.md), where the
whole point is to have built nothing at all. From phase 1 onward the stream is ours end to
end.

WhatsApp keeps one job forever: **booking, invitations and links**. It is where these
families already live, and putting the front door somewhere else is how this company loses.
But the video never touches it.

## Why owning the stream is not optional

The instinct to own the product is right, and it is more right than it first appears. Five
concrete reasons, in order of how badly each would hurt:

### 1. Content ID would destroy the archive

A Congolese wedding plays commercial music continuously — rumba, ndombolo, gospel. A
*matanga* plays it for three days. YouTube's Content ID scans live streams *and* the
recordings they leave behind, and it mutes, blocks or terminates them automatically. Facebook
Live behaves the same way.

So the single most valuable thing we sell — **the complete recording of a funeral** — is the
thing most likely to be silently muted or taken down by a copyright robot, weeks later, with
no appeal that a grieving family in Paris will ever successfully navigate. That alone ends
the YouTube conversation. We would be building the archive guarantee on infrastructure
designed to delete it.

### 2. There is no product without access control

Everything in [document 03](./03-business-model.md) needs to know *who this viewer is*: the
family pool, per-viewer access, paid recording access, the contribution rail. An unlisted
YouTube link knows nothing and can be forwarded to anyone forever. Private by default,
expiring tokens, a visible viewer list, revocation — none of that exists on somebody else's
platform.

### 3. Talk mode cannot exist on a broadcast platform

Sylvain speaking into the room during the toast is the emotional peak of the product and the
core design insight in [document 02](./02-solution.md). It requires a two-way path between a
specific viewer and the capture device. No broadcast platform offers it.

### 4. The telemetry protects our correspondents

[Document 05](./05-operations.md) depends on separating *"the correspondent was bad"* from
*"the network was bad"* — a distinction customers cannot make and always resolve against the
operator. That needs per-second delivery data from our own pipeline. Lose it and good
correspondents get punished for Congolese cell towers, and the supply side rots.

### 5. The family graph is the company

Who belongs to which family, who pays, who watches, whose events recur. Per
[document 04](./04-market-and-competition.md) this is the asset that makes the payments
business possible later. It accrues only from running our own stack.

## But "own everything" is not the same as "build everything"

This is the distinction worth being careful about, because getting it wrong burns a seed
round on undifferentiated plumbing.

> **Own the interface. Rent the commodity.**

| Layer | Decision | Why |
| --- | --- | --- |
| Capture client, segment protocol, ladder, power manager | **Build** | The moat. Nothing off the shelf does store-and-forward with an audio floor |
| Ingest, completeness tracking, archive assembly | **Build** | The refund guarantee and the payout rules depend on it |
| **Our own player and manifest format** | **Build** | The thing this document is about. See below |
| Access tokens, viewer identity, the family graph | **Build** | The product |
| Transcode compute | **Rent** | ffmpeg on commodity VMs, or Mux |
| CDN edge and egress | **Rent** | Genuinely a commodity. Building one is a decade-long distraction |
| SFU for Talk mode | **Rent** | LiveKit until volume justifies self-hosting |
| Object storage | **Rent** | S3-compatible, swap freely |

The load-bearing move is **owning the player and the manifest.** If viewers only ever talk to
`elongo.cg` and our player fetches our manifest with our tokens, then which CDN serves the
bytes is an implementation detail we can change on a Tuesday without a single customer
noticing. That is what "we control the whole product" means in practice — not operating our
own fibre.

Build your own CDN in year one and you will have a worse CDN than Cloudflare and no
customers. Rent the pipes, own everything the customer can see or feel.

## Viewing surfaces

Now the part where I would reorder your list, with reasons.

### The TV insight is bigger than it looks

You are right that people will want this on a television, and I think the reason is stronger
than convenience.

**A wedding watched on a phone is a private experience. On a television in a living room in
Créteil, it becomes a gathering.** The diaspora household watches *together* — parents,
children, the cousin who came over, the neighbour who knew the family back home. That is
culturally accurate and it changes what the product is: three hours is far too long to hold a
phone, but exactly right for a Saturday afternoon in a living room with people coming and
going.

TV is not a nice-to-have. For long ceremonies it is the natural venue, and it also quietly
raises the pool coefficient, because one screen can hold six relatives who each might
otherwise have contributed nothing.

### But the cheap route to TV is not a TV app

Native TV apps are genuinely painful: Samsung Tizen, LG webOS, Android TV, tvOS, Roku, Fire
TV — six separate SDKs, six store reviews, six certification processes, six release trains.

**Google Cast and AirPlay get most of that value for a fraction of the work.** Sylvain opens
the link on his phone, taps the cast icon, and it is on the television in three seconds. No
install, no store, no account on the TV. It covers most Chromecast-capable and Android TV
sets, every Apple TV, and a large share of modern smart TVs.

And here is the part that makes it nearly free: **a Google Cast receiver is a web page.**
Because we own the player, we already have one. Casting costs us a styled build of the player
we were writing anyway.

Native TV apps come later, for the two platforms the data says diaspora households actually
own — and we will know that from our own analytics rather than guessing.

### Where I would put desktop

Honestly: last, and possibly never for viewing.

A desktop application to *watch video* adds very little over a browser today. Browsers do
hardware-accelerated playback, fullscreen, picture-in-picture, and — the case you raised —
**HDMI output to a television is handled by the operating system, not by the application.**
A browser fullscreened on a laptop plugged into a TV is pixel-identical to a native app doing
the same thing.

Against that, a desktop app costs: code signing certificates for Windows and Apple, Apple
notarisation, an auto-update service, three OS build targets, and a permanent security-patch
obligation on an Electron runtime. That is real, recurring engineering for close to zero
viewer benefit.

There is also an audience problem. The strongest argument for a desktop app is the diaspora
household with an old Windows laptop and a bad browser — but that is precisely the household
least likely to successfully install, permit and keep updated a downloaded application. For
them the browser is *more* reliable, not less.

**Where a desktop app does eventually earn its place** is a different product for a different
person: the family archivist. Bulk-downloading years of recordings, managing an offline
family library, preparing a memorial film. That is a real and lovely product, and it is a
phase 3+ conversation, not a viewing client.

### Native mobile is where I would spend the app budget instead

This is the surface I would build before either TV or desktop, and it is the one that most
justifies "install our app for the best experience":

- **Push notifications.** *"The ceremony is starting now."* Browsers do this badly, and iOS
  web push is unreliable enough that we cannot depend on it. For an event that happens once,
  at a fixed moment, four time zones away, the notification **is** the product. A relative
  who misses the start because a browser tab was closed is a refund and a bad review.
- **Talk mode, properly.** Native audio gives us real echo cancellation, correct routing, and
  behaviour that does not break when the user switches apps. Browser WebRTC is workable and
  meaningfully worse.
- **Background audio.** Keep listening to your mother's funeral while you cook. This matters
  more than it sounds and browsers cannot do it reliably.
- **Offline recordings.** Download the ceremony, watch on the métro, keep it forever.
- **Cast and AirPlay** are first-class from a native app, which folds the TV story into this
  same build.

### The ranking, then

| Priority | Surface | Effort | Why |
| --- | --- | --- | --- |
| 1 | **Browser player (ours)** | Medium | Universal, zero friction, the permanent fallback. Never optional |
| 2 | **Cast + AirPlay** | Low | Buys the living room almost free, because we own the player |
| 3 | **iOS + Android apps** | High | Push notifications, Talk mode, background audio, offline |
| 4 | **Native TV apps** (top 2 platforms) | High | Once analytics say which sets diaspora households own |
| 5 | Desktop | High | Only for the archivist product, if it proves out |

## One link, everywhere

The rule: **there is exactly one URL for a Presence**, and it works for everyone.

```
                        elongo.cg/g/8fa2kd
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   app installed          no app                on a computer
        │                      │                      │
   opens the app        opens in browser        opens in browser
   (universal link)     + a quiet banner:       full experience
        │               "better in the app"            │
        └──────────────────────┴──────────────────────┘
                               │
                        [ Cast to TV ]
```

Implemented as **iOS Universal Links** and **Android App Links** — the same `https://` URL,
which opens the app when installed and the browser when not. Never a custom `elongo://`
scheme, which breaks when shared, and never an interstitial "do you have the app?" page.

Three rules that matter because the link travels through WhatsApp:

1. **It must never dead-end.** If someone forwards it to an aunt without the app, she
   watches in her browser immediately. A funeral link that shows an install wall is
   unforgivable, and the moment does not wait.
2. **It must preview well.** WhatsApp renders a card from Open Graph tags — the event name,
   the date, a still. That card is what makes a relative tap it in a busy family group.
3. **The nudge stays quiet.** A dismissible bar, never a modal over a ceremony.

## What the browser player has to do anyway

Since it is the fallback and the majority surface for years, it is not a lesser product:

- LL-HLS playback via Media Source Extensions, hardware-decoded
- Our manifest, our short-lived signed tokens, revocable per viewer
- Live plus DVR — relatives across five time zones do not all arrive on time, and rewinding
  to the start matters more than it sounds
- The honest status line (*"Réseau chargé · 240p"*, *"Mode économie d'énergie"*) — managing
  scarcity visibly **is** the product, per [document 02](./02-solution.md)
- Viewer list, Talk mode request, reactions
- Cast and AirPlay buttons
- Works on a five-year-old Android in a browser with 400 MB of RAM

## Sequencing against the roadmap

Slotting into [document 07](./07-roadmap-and-validation.md):

| Phase | Client work |
| --- | --- |
| **0** (month 1) | None. Unlisted YouTube, deliberately throwaway. Do not build a player to test whether anyone will pay |
| **1** (months 2–6) | Hosted streaming, but **our own player skin and our own links** from the start, so customers never see another brand and we can swap the backend later |
| **2** (months 6–15) | Our full stack: capture client, ingest, manifest, browser player, **Cast + AirPlay** |
| **3** (months 15–30) | iOS and Android apps, universal links, push notifications, offline recordings, native TV apps for the top two platforms |
| **4** (month 30+) | Desktop, only if the archivist product proves out |

The principle underneath: **own the customer-facing surface from day one, own the pipes when
volume justifies it, and never let a platform you do not control stand between a family and
their own funeral.**
