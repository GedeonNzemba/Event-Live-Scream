# `mobile/` — the native apps

Two Expo apps and three shared packages, following the plan in
[docs/12](../docs/12-mobile-apps.md).

```
mobile/
  apps/
    correspondent/   Android. Capture, survive a bad network, survive a bad battery.
    viewer/          iOS + Android. Watch, be notified, keep the recording.
  packages/
    domain/          ladder, power budget, upload priority, capture engine
    design/          tokens, type scale, French formatting, ladder geometry
    api/             typed client for the media service
```

---

## What is actually verified, and what is not

This distinction matters more than the file listing, so it comes first.

**Verified here, by `npm test`** — 108 tests, no device, no network, under a second:

| Area | What is held in place |
| --- | --- |
| Ladder | Monotonic bitrate; no gap wider than 2×; the floor carries audio |
| Controller | Recovers from the buffered rung; probes upward when queue-limited; freezes rather than decays through an outage; power cap wins over bandwidth |
| Power | Draw falls monotonically down the ladder; weak signal costs more; the preview is sacrificed before the picture; an impossible budget says so |
| Segments | Live audio outranks everything; **backfill is never gated by the rung**; backlog is measured at the live edge only |
| Engine | A ten-minute outage delays content and loses none of it; a slow link keeps the sound; an ambiguous upload is not re-sent forever; a broken heartbeat does not stop the capture |
| Design | Bars tile without overlap; a bucket takes the worst rung, never the mean; an outage is drawn where it happened; "100 %" is reserved for genuinely complete |
| API | A 4xx stops, a 5xx retries, a stalled socket is aborted; the capture key never reaches the URL |
| Tokens | Each app's Tailwind theme matches `design/src/tokens.ts` exactly |

**Not verified here, and not claimable until you run it:**

- Neither Expo app has been built or launched. They were written offline, in a
  container with no Android SDK and no device.
- **VisionCamera's chunked fMP4 recording is unproven.** It is the single
  assumption the native app rests on. Phase A in docs/12 exists to test it in
  week one, on two real phones, before anything else is built.
- Dependency versions in `apps/*/package.json` are a best guess made offline.
  Run `npx expo install --check` in each app and accept its corrections before
  trusting them.
- Fonts are not committed. See `apps/*/assets/fonts/README.md`.

---

## Running it

```bash
cd mobile
npm install
npm test                 # the part that works today
```

For the apps, on your own machine:

```bash
# 1. Fonts — five files, see apps/*/assets/fonts/README.md
# 2. Reconcile versions against the installed Expo SDK
cd apps/correspondent && npx expo install --check

# 3. A development build. Expo Go cannot load VisionCamera or expo-sqlite,
#    so it is not part of this project at all.
npx expo prebuild --platform android --clean
npx expo run:android

# 4. Point the app at the media service running on your machine.
#    10.0.2.2 is the host as seen from an emulator; a real handset needs your
#    LAN address, and a real handset is the only configuration that proves
#    anything — the emulator has your laptop's fibre.
EXPO_PUBLIC_MEDIA_URL=http://192.168.1.20:3100 npx expo start --dev-client
```

The media service it talks to is the existing one:

```bash
cd .. && npm run media    # http://localhost:3100
```

---

## The four rules the engine is built to protect

Each of these was a bug before it was a rule, and each has a test named
`REGRESSION` guarding it. They are restated in the source because a
reimplementation on a new platform is exactly where hard-won rules get quietly
dropped — which is what happened to the browser client.

1. **The latency budget is the resilience budget.** Watch mode runs seconds
   behind on purpose and a shallow send queue is healthy. Thresholds are
   fractions of the live window, never absolute seconds.

2. **Only the live edge counts as congestion.** Measuring backlog across all
   pending content — old by definition after an outage — pins the ladder at the
   buffered rung for the rest of the event.

3. **Throughput is only a measurement when the link was the limit.** At the
   audio floor the client offers 24 kbps and will measure 24 kbps forever.
   Queue-limited samples are a lower bound; probe upward.

4. **An outage is not a bandwidth sample.** Freezing the estimate beats decaying
   it; decay leaves the client crawling back from zero for minutes.

And one the mobile engine added, because the simulation found it within an hour:

5. **Believing you are offline is not a reason to stop trying.** The only way to
   learn the link came back is to attempt a send. A client that sends nothing at
   the buffered rung stays offline for the rest of the event no matter what the
   network does. Throttle to one probe per tick — do not stop.

---

## Open items, in the order they matter

1. **Prove VisionCamera chunked recording on real hardware.** Everything else is
   downstream of this. If it does not work, the fallback is a native module
   around AndroidX Media3 — about three weeks, not a rewrite.

2. **Background upload.** `MediaTransport` uses `fetch`, which stops when
   Android suspends the app. Fine during capture, when a foreground service
   keeps the app alive; **not** fine for the post-event drain with a large
   backlog. Needs `react-native-background-upload`.

3. **The foreground service.** Android will doze a backgrounded app mid-ceremony.
   Xiaomi, Oppo and Huawei — all common in Congo — need a per-vendor autostart
   prompt on top. [dontkillmyapp.com](https://dontkillmyapp.com) is the reference.

4. **Playback.** The viewer renders the timeline, the status and the
   completeness, but not yet the video: `expo-video` wants HLS, and the server
   only produces the JSON manifest the browser player uses. Both land together
   with fMP4 capture.

5. **A JSON API for `app/`.** The booking and family-pool service is
   server-rendered HTML with form posts — the right call for something opened
   from a WhatsApp link on any phone, but there is no JSON surface for the
   viewer's pool screens to consume. Prerequisite for contributions in-app.

6. **Push notifications.** *"La cérémonie commence"* is the most important
   message this company sends, and a one-time event four time zones away is
   missed entirely if it arrives late.

7. **Payments.** Deliberately last, after real testing.
