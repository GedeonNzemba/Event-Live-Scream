# 12 — The mobile apps

*A build plan for the native correspondent and viewer apps, with every library choice named,
justified and linked to its own documentation.*

---

## First: WhatsApp is not blocking you

The Meta Cloud API is unavailable in your location. That sounds fatal for a product whose
front door is WhatsApp. It is not, and the reason is worth understanding before anything else
gets planned around it.

**Sharing a link into a WhatsApp group has never needed the API.** A user taps share, picks
WhatsApp, and sends it. That is the operating system's share sheet, it is free, it works in
every country, and it is exactly how the family pool spreads. The API is only for *automated,
proactive* messages sent by a machine.

So once you have native apps, the API's job splits three ways and mostly disappears:

| What it was for | What replaces it | Cost |
| --- | --- | --- |
| Sharing the pool link into a family group | **Native share sheet** and `wa.me` deep links | Free, no API, works everywhere |
| Telling the diaspora the ceremony is starting | **Push notifications** — APNs and FCM | Free |
| Telling a correspondent in Brazzaville about a mission | **SMS** via [Africa's Talking](https://africastalking.com/sms/bulksms), which covers Congo-Brazzaville | ~€0.01–0.02 per message |
| Everything else | Nothing. It was never needed | — |

This is not a downgrade. [Document 09](./09-platforms-and-clients.md) already argued that push
notifications outrank every other client feature, because a one-time event four time zones
away is missed entirely if the notification arrives late — and push is both more reliable and
free. **The apps make the WhatsApp API optional rather than urgent.**

If you still want it later, you go through a **Business Solution Provider** rather than Meta
directly. BSPs are Meta-certified resellers who handle the account relationship and operate in
regions where direct signup is closed: [360dialog](https://360dialog.com),
[Gupshup](https://gupshup.io), [Infobip](https://infobip.com), and
[Arkesel](https://arkesel.com/whatsapp-business-api-africa-guide/) which specialises in Africa.
Treat it as a phase-3 decision, not a prerequisite.

**Do this now:** create an Africa's Talking account and send one test SMS to a Congolese
number. It is the only piece of this that has a country restriction worth checking early.

---

## Second: the native camera changes the architecture for the better

The browser client has a limitation documented in [`media/`](../media): `MediaRecorder`
cannot change bitrate once started, and it produces WebM, which no HLS playlist can reference
without a remux. That forced a JSON manifest played through Media Source Extensions.

**VisionCamera removes both problems.** It supports chunked recording — emitting segments
*during* capture rather than one file at the end — and produces **fragmented MP4**, with
`onInitSegmentReady` for the initialisation segment and `onVideoChunkReady` for each
chunk.[^vc]

That is not a small convenience:

- **fMP4 is what HLS wants.** Real playlists, cached hard by any CDN, played natively by
  iOS, Android, Apple TV and every smart television — which is the phase-3 client story in
  [document 09](./09-platforms-and-clients.md), unlocked for free.
- **A native encoder can actually change bitrate**, so the degradation ladder from
  [document 06](./06-technical-architecture.md) becomes a real encode policy instead of the
  upload policy the browser forced. This is the single biggest quality and data-cost win
  available, and it is the reason the native app exists at all.
- The server's ingest, completeness tracking and token model need **no changes**. The wire
  protocol was designed around opaque segments precisely so this swap would be mechanical.

**Caveat, and it matters:** chunked recording and the Android fMP4 muxer are recent additions
to VisionCamera. Validate them on two real Android devices in week one, before any of this
plan is committed to. If they do not work, the fallback is a small native module around
`AndroidX Media3` and `AVAssetWriter` — perhaps three weeks of work, not a rewrite.

---

## Two apps, not one

The correspondent and the family are different people, in different countries, with almost
nothing in common.

| | **Elongo Correspondant** | **Elongo** (viewer) |
| --- | --- | --- |
| Who | A 23-year-old in Brazzaville, paid to film | A relative in Créteil, Brussels, Montréal |
| Platform | **Android only** — iPhone share in Congo is negligible | iOS **and** Android |
| Job | Capture, survive a bad network, survive a bad battery | Watch, be notified, contribute, keep the recording |
| Permissions | Camera, microphone, foreground service, notifications | Notifications only |
| Language | French, with Lingala voice-over on training | French and English |
| Network | Assumed hostile | Assumed fine |
| Store risk | Background/foreground-service justification | Ordinary |

Building these as one app means asking a French grandmother to grant camera and
foreground-service permissions so she can watch a wedding, which is both bad UX and a
review risk. **Two apps in one monorepo**, sharing a design system, an API client and the
domain logic already written in [`pool/`](../pool).

```
mobile/
  apps/
    correspondent/     Expo app — Android
    viewer/            Expo app — iOS + Android
  packages/
    design/            tokens, typography, components, icons
    api/               typed client for media/ and app/
    domain/            ladder, power budget, money — ported from prototype/ and pool/
```

---

## The stack

Every choice below is a free, open-source, actively maintained library, with its
documentation linked. **Read the linked page before implementing against it** — several of
these have changed significantly in the last year.

### Foundation

| Concern | Choice | Why this one | Docs |
| --- | --- | --- | --- |
| Framework | **Expo SDK 57** | SDK 54 was the last to support the legacy architecture; the New Architecture is now the default and ~83% of EAS builds use it | [expo.dev/changelog](https://expo.dev/changelog/sdk-57) |
| Builds | **EAS Build** + **development builds** | Expo Go cannot load VisionCamera or background upload. You will not use Expo Go on this project at all — plan for that on day one | [Development builds](https://docs.expo.dev/develop/development-builds/introduction/) |
| Navigation | **expo-router** | File-based, and gives universal/app links for free — which [document 09](./09-platforms-and-clients.md) requires so one URL opens the app or the browser | [Expo Router](https://docs.expo.dev/router/introduction/) |
| Language | **TypeScript**, strict | Shares the domain types already written | — |

### The correspondent app's hard parts

| Concern | Choice | Why | Docs |
| --- | --- | --- | --- |
| Camera | **react-native-vision-camera** | Chunked fMP4 recording. This library *is* the reason the native app is worth building | [VisionCamera](https://react-native-vision-camera.com/docs/guides) |
| Segment index | **expo-sqlite** | The IndexedDB replacement. Crash-safe, queryable, survives the app being killed | [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) |
| Segment bytes | **expo-file-system** | Chunks on disk, paths in SQLite. Never hold media in memory | [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) |
| Background upload | **react-native-background-upload** | Wraps `URLSession` background transfers on iOS and a service on Android, so uploads continue when the app is backgrounded or terminated | [repo](https://github.com/Vydia/react-native-background-upload) |
| Staying alive while filming | **expo-task-manager** + an Android **foreground service** | Android will otherwise doze the app mid-ceremony. The persistent notification is correct UX anyway: *"Elongo enregistre"* | [expo-task-manager](https://docs.expo.dev/versions/latest/sdk/task-manager/) |
| Network state | **@react-native-community/netinfo** | Detects the cell coming back, so reconciliation runs immediately rather than on the next timer | [netinfo](https://github.com/react-native-netinfo/react-native-netinfo) |
| Battery | **expo-battery** | Feeds the power budget from [document 06](./06-technical-architecture.md) — the arithmetic that makes a ceremony reach its end | [expo-battery](https://docs.expo.dev/versions/latest/sdk/battery/) |
| Keep awake | **expo-keep-awake** | The screen may sleep; the capture may not | [expo-keep-awake](https://docs.expo.dev/versions/latest/sdk/keep-awake/) |

### The viewer app

| Concern | Choice | Why | Docs |
| --- | --- | --- | --- |
| Playback | **expo-video** | Native HLS with multi-track support, which is what fMP4 segments unlock. Replaces the hand-rolled MSE player | [expo-video](https://docs.expo.dev/versions/latest/sdk/video/) |
| Push | **expo-notifications** + FCM/APNs | *"The ceremony is starting"* is the most important message this company sends | [Push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) |
| Casting | **react-native-google-cast** + native AirPlay from expo-video | The living-room television, which [document 09](./09-platforms-and-clients.md) argues is where a three-hour ceremony is actually watched | [google-cast](https://react-native-google-cast.github.io/docs/getting-started/installation) |
| Payments | **@stripe/stripe-react-native** | Native Payment Sheet, Apple Pay and Google Pay. Each Expo SDK pins a specific version — check the changelog | [Stripe RN](https://docs.stripe.com/libraries/react-native) |
| Sharing | **expo-sharing** / `Share` | The pool link into WhatsApp, with no API | [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/) |
| Offline recordings | **expo-file-system** downloads | "The family keeps it forever" should mean a file | [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) |

### Shared

| Concern | Choice | Why | Docs |
| --- | --- | --- | --- |
| Server state | **TanStack Query** | Caching, retries and offline-first behaviour, which this product needs more than most | [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) |
| Local state | **Zustand** | Small and boring. The capture state machine does not need more | [Zustand](https://zustand.docs.pmnd.rs/) |
| Fast key-value | **react-native-mmkv** | Synchronous reads for the capture key and session state | [mmkv](https://github.com/mrousavy/react-native-mmkv) |
| Animation | **Reanimated 4** + **Gesture Handler** | Runs on the UI thread, so the scrubber stays smooth while segments upload | [Reanimated](https://docs.swmansion.com/react-native-reanimated/) |
| Custom graphics | **React Native Skia** | The signal ladder and the outage timeline — the two visuals that carry the brand | [Skia](https://shopify.github.io/react-native-skia/) |
| Errors | **Sentry** (free tier) | A correspondent cannot file a bug report from Makélékélé | [Sentry RN](https://docs.sentry.io/platforms/react-native/) |

### Deliberately not used

- **Expo Go** — cannot load the native modules this product depends on.
- **A pre-styled component kit** (gluestack, React Native Paper, NativeBase) — they carry a
  visible house style, and Paper in particular makes every app look like stock Material
  Design. See the design section below.
- **expo-av** — superseded by `expo-video` and `expo-audio`.
- **A cross-platform video SDK** (Mux, Agora, LiveKit) for capture — the whole moat is that we
  do store-and-forward and they do not.

---

## The design system

The brief was: professional, modern, **not AI-looking**. That is a real constraint with a
specific meaning, so here is what it rules out and what replaces it.

### What "AI-looking" means, concretely

Avoid: Inter or Space Grotesk as the only typeface; a purple-to-blue gradient anywhere; warm
cream `#F4F1EA` with a terracotta accent; emoji as section markers; every corner at the same
`rounded-lg`; a coloured bar on the left of every card; centred everything; stock illustration
of diverse people pointing at a laptop.

None of those are *bad*. They are simply what every generated interface currently looks like,
and this product is asking families to trust it with a funeral.

### Typography

Three faces, each doing a distinct job. All free for commercial use.

| Role | Face | Why | Licence |
| --- | --- | --- | --- |
| Display | **Fraunces** | A variable "old style" serif with optical sizing and `wonk`/`soft` axes. Warm, high-contrast, unmistakably not a default. Carries the gravity a *matanga* deserves without looking funereal | [SIL OFL](https://fonts.google.com/specimen/Fraunces) |
| Interface | **Switzer** | Swiss neo-grotesque, 18 styles, genuinely excellent at small sizes on cheap Android screens. Neutral without being lifeless | [ITF Free Font License](https://www.fontshare.com/fonts/switzer) |
| Data | **JetBrains Mono** | Timecodes, battery, bitrate, references. Tabular figures, unambiguous `0`/`O` — which matters when a reference is read aloud down a bad line | [SIL OFL](https://www.jetbrains.com/lp/mono/) |

Load with [`expo-font`](https://docs.expo.dev/versions/latest/sdk/font/), subset to Latin
Extended, and ship the variable versions — one file each, and the correspondent is paying for
their own download.

Scale: 12 / 14 / 16 / 20 / 26 / 34 / 44. Body at 16 with 1.5 line height, never below 14.
Display gets tight tracking (−0.02em); uppercase labels get +0.12em.

### Colour

Rooted in the existing web identity, adapted for a phone.

```
--ink-950   #0B1620   ground, dark        true dark, so OLED pixels switch off
--ink-900   #13222C   raised surface
--ink-700   #24394A   borders
--ink-300   #9FB4BF   secondary text
--ink-50    #E9EDEF   primary text on dark

--signal    #E2913C   marigold — live, attention, the accent
--river     #2E9A94   teal — delivered, complete, good
--brick     #C4564A   loss — outage, refund, error
--sand      #D9C9A8   warm neutral, used sparingly for keepsake surfaces
```

**Dark by default, and that is a product decision rather than a fashion.** On an OLED screen
a dark interface measurably reduces power draw, and the correspondent's battery is the
constraint the whole company exists to work around
([document 01](./01-problem.md)). The viewer app offers light as a preference; the
correspondent app does not.

Neutrals carry a slight teal bias so they read as chosen rather than inherited. Semantic
colours (river / brick) are separate from the accent and never used decoratively.

### Components and icons

- **NativeWind v4** for styling — the Tailwind mental model, shared vocabulary with the web
  app, compiled ahead of time so there is no runtime style cost.
  [Docs](https://www.nativewind.dev/)
- **React Native Reusables** for primitives — unstyled, composable, built on NativeWind.
  It is the shadcn/ui model: you copy the component in and own it, rather than inheriting
  someone's house style. [Docs](https://rnr-docs.vercel.app/)
- **Lucide** for icons — 1,500+ SVG icons on a consistent grid, rendered through
  `react-native-svg`. Set stroke at 1.75px and size at 22px; never mix with Material or
  Ionicons. [Docs](https://lucide.dev/guide/packages/lucide-react-native)

### The one distinctive thing

Every product needs a visual signature. Ours is already sitting in the architecture: **the
signal ladder** — the stepped bar showing quality falling and recovering across an event.

It appears in three places, drawn with Skia:

1. **Correspondent, live** — a small live ladder showing the current rung, so a correspondent
   can see the network degrading without reading text.
2. **Viewer, on the scrubber** — the quality of each moment, with outages marked, so a
   relative can see there was one hole at 1:05 and it is the only one.
3. **The recording's cover** — the whole event's ladder as its thumbnail. Every recording gets
   a shape unique to the afternoon it was filmed.

That last one is the kind of detail that makes a product feel made rather than assembled, and
it costs almost nothing because the data already exists.

### Motion

Restrained, and specific. Reanimated 4, spring physics, respecting
`prefers-reduced-motion`:

- The ladder animates between rungs — the only continuously animated thing in either app.
- Screen transitions are shared-element where the same object persists (a pool card opening
  into a pool screen).
- Nothing pulses, bounces or shimmers. A skeleton loader is a rectangle, not a wave.

---

## Constraints to design around, not discover

These are platform realities that will otherwise be found the hard way in week six.

**iOS cannot record video in the background.** There is no background camera API, and there
will not be one. The correspondent app must stay foregrounded while filming. This is a
non-issue in practice — the correspondent is holding the phone and pointing it — and it is
another reason the correspondent app is Android-first.

**Android will kill you unless you ask not to be.** Doze and battery optimisation will
suspend a backgrounded app mid-ceremony. The answer is a **foreground service** with a
persistent notification, which is also honest UX. Some manufacturers (Xiaomi, Oppo, Huawei —
all common in Congo) are more aggressive still and need a per-vendor "allow autostart" prompt.
Budget real time for this; [dontkillmyapp.com](https://dontkillmyapp.com) is the reference.

**Uploads must survive the app dying.** iOS `URLSession` background transfers and Android's
upload service both continue after termination. This is why `react-native-background-upload`
is in the stack rather than `fetch`.

**Store review will ask about the foreground service and the camera.** Have the answer
written before submitting: the app films an event the user is physically attending, with
on-screen consent from the host, and uploads it to a private family link.

**Expo Go is not part of this project.** Development builds from day one.

---

## Phasing

Weeks are for a single experienced React Native developer. Double them for a first-timer.

### Phase A — Prove the risky thing (weeks 1–2)

Nothing else matters until this works.

- Bare Expo app, development build, VisionCamera installed
- Record ten minutes to chunked fMP4 on **two real Android phones**, one of them cheap
- Verify `onInitSegmentReady` and `onVideoChunkReady` fire, and that the segments upload to
  the **existing** `media/` ingest unchanged
- Kill the app mid-recording; confirm the queue survives and resumes

**Exit test:** a phone that lost signal for ten minutes ends with 100% completeness on the
server. That is the same guarantee `media/` already proves in a browser.

If VisionCamera's chunked recording does not deliver, stop and reassess here — not in month
three.

### Phase B — The correspondent app (weeks 3–7)

- Design system package: fonts, tokens, Lucide, the Skia ladder
- Mission list, consent checklist, capture screen, the honest status line
- SQLite segment store, priority uploader, reconciliation — ports of logic already written
  and tested in [`prototype/`](../prototype) and [`media/`](../media)
- Power budget wired to `expo-battery`, with the real encoder bitrate ladder
- Foreground service, keep-awake, vendor autostart guidance
- SMS mission offers via Africa's Talking

### Phase C — The viewer app (weeks 8–12)

- Pool: browse, contribute, share to WhatsApp via the share sheet
- Player on `expo-video` with HLS, DVR, the outage timeline
- Push notifications, universal links so one URL opens app or browser
- Cast and AirPlay
- Download a recording for offline

### Phase D — Payments and polish (weeks 13–16)

- Stripe Payment Sheet, Apple Pay, Google Pay
- Accessibility pass: dynamic type, screen readers, contrast
- Sentry, analytics, crash-free rate above 99.5%
- Store listings, screenshots, privacy declarations, review submission

**Total: roughly four months** to both apps in the stores, assuming Phase A succeeds.

---

## What to do first

In order, and none of it is writing app code:

1. **Send one SMS to a Congolese number via Africa's Talking.** It is the only remaining
   country-restricted dependency and it takes an afternoon to disprove.
2. **Buy two cheap Android phones** of the kind a correspondent would actually own — a Tecno
   or an Infinix, not a Pixel. Every performance and battery assumption in this plan should be
   measured on those.
3. **Run Phase A.** Two weeks, one question: does chunked fMP4 recording work on real
   hardware?
4. **Only then** commit to the four-month plan.

And the thing that has not changed since [document 07](./07-roadmap-and-validation.md): none
of this tells you whether families will pay. Ten real events still would, and they can be run
with the web app that already exists while Phase A is happening.

---

[^vc]: VisionCamera chunked recording — [feature discussion](https://github.com/mrousavy/react-native-vision-camera/issues/2693)
and the Android fragmented-MP4 implementation adding `onInitSegmentReady` and segment
duration to `onVideoChunkReady`. Both are recent; verify against the current release before
relying on them.
