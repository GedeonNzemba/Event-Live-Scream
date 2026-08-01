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

**Run Expo from `mobile/apps/viewer` or `mobile/apps/correspondent` — never from
the repository root and never from `app/`.** The repository's top-level `app/`
directory is the server-rendered booking site, a plain Node HTTP server. It has
a `package.json`, so the Expo CLI will happily start there, find no `main`, fall
back to its legacy entry point and fail with:

```
Unable to resolve module ./node_modules/expo/AppEntry from .../Event-Live-Scream/app/.
```

That error means "wrong directory", nothing more.

```bash
cd mobile
npm run setup     # install + fonts + doctor, in that order
npm test          # 108 tests, the part that works today
```

`npm run setup` must run **from `mobile/`**. Running `npm install` at the
repository root instead installs nothing useful — the root `package.json` has no
dependencies — and running it inside an app directory fights the workspace. In
both cases you end up with no `mobile/node_modules`, and the failure is quiet in
the worst possible way: npx then walks up past the repository and runs an Expo
CLI from somewhere else on your machine, usually `~/node_modules`. Every error
after that names paths belonging to an unrelated project.

`npm run doctor` exists to catch exactly that. Its most useful line reports
which `expo` binary npx would actually run; if that path is not inside this
repository, nothing else in the output matters until it is.

Then, still from `mobile/` — these route to the right workspace themselves, which
is the point:

```bash
npm run ios         # the viewer, iOS
npm run android     # the correspondent, Android
```

By hand, `cd` into an app directory first:

```bash
cd apps/viewer            # iOS + Android
# or
cd apps/correspondent     # Android only

npx expo install --check  # reconcile the offline version guesses with your SDK
npx expo run:ios          # a development build — see below
```

### Troubleshooting the first build

**`npm run fix` before anything else if a build fails.** Every version in
`apps/*/package.json` was written offline, without an Expo SDK to check against.
`expo install --fix` rewrites them all to what the installed SDK actually wants,
and it is the authority here — not this repository. The first iOS build failed
for exactly this reason: `react-native@0.81.0` was pinned where SDK 54 wants
`0.81.5`, and 0.81.0's precompiled-iOS-dependencies script fails during
`pod install`.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `cp: framework/packages/react-native/..: File exists` during `pod install` | React Native 0.81 ships iOS dependencies as a precompiled `ReactNativeDependencies.xcframework`; its copy step fails on leftover native state, and on 0.81.0 specifically | `npm run clean && npm run fix && npm run ios` |
| `No code signing certificates are available` | Expo targeted a *physical* device — usually because one is plugged in | Pick a simulator: `cd apps/viewer && npx expo run:ios --device` and choose one from the list |
| `Using react-native@X instead of recommended @Y` | An offline version guess in this repo | `npm run fix` |
| Pods fail to install at all | CocoaPods missing or stale | `brew install cocoapods`, then `npm run clean && npm run ios` |
| `Cannot find module './utils/autoAddConfigPlugins.js'` after `expo install` | Expo used a different package manager (usually bun) and reinstalled everything on top of the npm tree, moving `@expo/cli`'s own files mid-run | Delete the foreign lockfile, `rm -rf node_modules && npm install`. `npm run doctor` detects this. |

**Native modules are pinned exactly, with no range operator.** `~0.5.1` resolved
to `0.5.2` and `^2.0.0` to `2.10.1`, and Expo rejected both. A native module's
version is decided by the SDK it links against, not by semver goodwill, so a
range there is a bug waiting for an upstream publish to trigger it. Expo's own
`expo-*` packages keep their `~` — those are versioned with the SDK and safe.

**One package manager, always npm.** Expo picks a package manager by sniffing
for lockfiles, and its choice overrides whatever actually built the tree. A
stray `bun.lock`, `yarn.lock` or `pnpm-lock.yaml` anywhere in the workspace makes
`expo install` reinstall ~1600 packages in *that* manager's layout on top of the
npm one. The result is not a clean switch but a hybrid `node_modules`, and the
errors it produces name internal Expo paths that look like Expo bugs. Both `fix`
scripts pass `--npm` explicitly for this reason.

`npm run clean` removes the generated `ios/`, `android/` and `.expo` directories
in both apps. They are build output, not source, and a half-finished prebuild
leaves state that the next attempt trips over rather than replaces.

**Starting Expo from `mobile/` or the repository root fails in a way that names
the wrong thing.** Expo takes its entry point from the `main` field of whatever
directory it considers the project. Neither of those has one, so it falls back to
the legacy `expo/AppEntry`, which imports `../../App`:

```
Unable to resolve "../../App" from "node_modules/expo/AppEntry.js"
```

This project has never had an `App` file — it uses expo-router, and both apps set
`"main": "expo-router/entry"`. The error means *wrong directory*, nothing more.

**`npm run fonts` is not optional.** `_layout.tsx` requires the five font files
by path and Metro resolves that at bundle time, so a missing file gives you the
same *Unable to resolve module* error before a line of the app runs. The files
are gitignored because they are third-party binaries; the script fetches
Fraunces and JetBrains Mono from Google Fonts and Switzer from Fontshare, and
substitutes Archivo if Fontshare's endpoint has moved so a typeface can never be
what stops you starting. `--fallback` forces the substitute.

**Expo Go is not part of this project.** The viewer needs `expo-video` and Skia;
the correspondent needs VisionCamera and `expo-sqlite`. None of them exist in
Expo Go, so `expo run:ios` / `expo run:android` — which build a development
client — are the only entry points.

Point the app at the media service on your machine:

```bash
cd .. && npm run media   # http://localhost:3100

# Simulator/emulator can reach the host directly; a real handset needs the LAN
# address, and a real handset is the only configuration that proves anything —
# the simulator has your laptop's fibre.
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
