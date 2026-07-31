# The media service

Capture in Brazzaville, ingest, archive, and playback for the family abroad. This is the
part of [docs/06](../docs/06-technical-architecture.md) that actually runs.

**No dependencies, no build step, no database.**

```bash
npm start          # http://localhost:3100
npm test           # 27 unit tests
npm run test:e2e   # 17 end-to-end checks in a real browser
```

Then open `/capture.html`, press **créer un événement de démonstration**, tick the three
consent boxes, press **Commencer** — and open the player link it gives you in another tab.

## What it does

```
  BRAZZAVILLE                    SERVER                      DIASPORA
  capture.html                                               player.html
    getUserMedia                  /ingest/:id/:track/:seq       manifest.json
    MediaRecorder     ─────▶      idempotent, out-of-order  ─▶  MSE playback
    IndexedDB store               completeness tracking         honest status
    priority uploader             signed viewer tokens          DVR from second 1
```

| Piece | File |
| --- | --- |
| Segment store, completeness, gaps | `src/store.ts` |
| Viewer tokens (HMAC, expiring, revocable) | `src/tokens.ts` |
| Manifest + the honest status line | `src/manifest.ts` |
| HTTP: ingest and playback | `src/server.ts` |
| Correspondent capture client | `public/capture.js` |
| The player | `public/player.js` |

## The end-to-end test is the interesting one

`npm run test:e2e` drives a real Chromium with a fake camera through the whole path, and
asserts the things the business actually promises:

```
PASS  refuses to film without the family's consent
PASS  segments reach the server                        4 sent
PASS  camera keeps filming while the network is gone   4s → 10s
PASS  backlog builds on the device instead of lost     6 segments held
PASS  status drops to the buffered rung
PASS  everything held during the blackout backfills    12 sent, 0 outstanding
PASS  archive completeness reaches 100%                100.0%
PASS  real media actually plays                        t=8.6s of 12.1s buffered
PASS  a forged token is refused in the browser too
```

The blackout sequence is the one that matters. The test ticks **Couper le réseau** on the
capture page, watches the camera keep rolling and the backlog build on the device, unticks
it, and then confirms every held second arrives and completeness reaches 100%. That is the
store-and-forward guarantee from [docs/02](../docs/02-solution.md), demonstrated rather than
asserted.

## Design decisions worth knowing

**Every write is idempotent.** On a Congolese uplink an ambiguous failure — sent, but no
response — is the normal case, not the exception. Re-sending identical bytes returns
`200 duplicate`; re-sending *different* bytes for the same sequence is a `409`, because
silently overwriting good content is worse than refusing. Segments are content-hashed and a
mismatch is rejected with `422`, since accepting mangled bytes would corrupt the family's
archive in a way nobody discovers until they sit down to watch it.

**Reconciliation, not blind retry.** `GET /ingest/:id/status` returns exactly which sequence
numbers arrived. After a blackout the client re-sends only the difference. Without this it
either re-uploads everything — burning the data bundle we paid for — or assumes success and
loses content.

**"Ended" and "complete" are different states.** The camera stopping and the archive arriving
are different moments, sometimes hours apart. That distinction *is* store-and-forward.

**Never a bare spinner.** The status line is computed server-side and says what is happening:
*"Connexion perdue — l'enregistrement continue, vous ne perdez rien"*, *"Mode économie
d'énergie — 240p15 · batterie 22 %"*. Per [docs/02](../docs/02-solution.md), the customer's
anxiety is uncertainty rather than low quality. Managing scarcity visibly is the product.

**Tokens fail closed.** No `ELONGO_TOKEN_SECRET` outside development throws at startup rather
than falling back to a guessable default. Every rejection returns `403` regardless of cause,
because telling an attacker whether a token was *expired* or *forged* tells them which half to
keep working on.

**The player is ours.** Per [docs/09](../docs/09-platforms-and-clients.md): Content ID would
mute a funeral full of commercial rumba, an unlisted link cannot express a family pool, and
Talk mode cannot exist on a broadcast platform.

## Two honest limitations

**The ladder is upload policy, not encode policy.** `MediaRecorder` cannot change bitrate once
started, so at the audio floor this client *stops sending* video and holds it on the device
rather than *encoding smaller* video. The viewer experience is identical — sound continues,
the picture holds, everything backfills — but the data bundle is not saved the way a native
encoder would save it. **This is the strongest single argument for the native Android app**,
and it is worth measuring on real events before building one.

**The manifest is JSON over MSE, not HLS.** Because we own the player we do not need a
standards-compatible playlist, and MediaRecorder produces WebM which an HLS playlist cannot
reference without a remux. Production adds fMP4 plus HLS alongside — CDNs cache it well and
televisions speak it natively — and the manifest shape is deliberately close to a playlist so
that swap is mechanical.

## What still needs work

Ordered by how much it matters, not by how hard it is. Everything here is known and none of
it is hidden behind a "coming soon".

**1. The audio floor is captured but never played.** The `a` track is recorded, uploaded and
counted toward completeness — but the player only ever plays the video track. So when the
ladder drops to audio-only, a viewer gets a held frame and *silence*, when the entire promise
in [docs/01](../docs/01-problem.md) is that they should still hear the wedding. This is the
largest gap in the media stack and it undercuts the core claim. Fixing it means a second
MediaSource for audio and a switch when the video track has a hole.

**2. Video quality is fixed at 900 kbps and cannot adapt.** `MediaRecorder` will not change
bitrate once started, so on a good connection the picture is worse than the link deserves,
and on a bad one it wastes the data bundle we paid for. There is no way around this in a
browser. **This is the case for the native Android app**, and it should be measured on real
events before that is built.

**3. No download.** A family that paid for a recording should be able to keep a file. Right
now they can only stream it, which is not what "the family keeps it forever" means.

**4. The player buffers the whole event.** Fine for twenty minutes, wrong for a three-hour
ceremony — it will hit the browser's buffer quota. Needs a sliding window with re-fetch on
seek; the eviction path exists but is not exercised.

**5. Talk mode.** The button is now hidden on recordings, where it was meaningless. On a live
event it is still a stub that says so.

**6. No transcode.** Segments are served exactly as captured, so every viewer downloads the
correspondent's full bitrate regardless of their own connection.

**7. Nothing is authenticated except viewer tokens.** `/dev/*` must not exist in production,
and there is no correspondent login — the capture key is the only credential.

Also outstanding: dual-SIM bonding (needs the native client), object storage and a CDN (files
on disk today; the interface is the same shape — [docs/10](../docs/10-stack-and-costs.md)),
the highlight reel, and the viewer list, which the player shows as a placeholder.
