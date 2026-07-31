/**
 * The Elongo player.
 *
 * Ours, not a vendor's, for the reasons in docs/09: an unlisted YouTube link
 * cannot express a family pool, Content ID would mute a funeral full of
 * commercial rumba, and Talk mode cannot exist on a broadcast platform.
 *
 * Two behaviours matter more than picture quality:
 *
 *   1. It never shows a bare spinner. When the network in Brazzaville dies the
 *      viewer is told the recording is continuing and nothing is being lost.
 *      The customer's anxiety is uncertainty, not low quality (docs/02).
 *
 *   2. It is a DVR from the first second. Relatives are spread across five time
 *      zones and do not all arrive on time, so joining late must never mean
 *      missing the entrance.
 */

const params = new URLSearchParams(location.search);
const PRESENCE = params.get("id") ?? "";
const TOKEN = params.get("t") ?? "";
const POLL_MS = Number(params.get("poll") ?? 2000);

const el = {
  title: document.getElementById("title"),
  when: document.getElementById("when"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlaySub: document.getElementById("overlaySub"),
  bar: document.getElementById("bar"),
  status: document.getElementById("status"),
  statusText: document.getElementById("statusText"),
  viewers: document.getElementById("viewers"),
  talk: document.getElementById("talk"),
  playPause: document.getElementById("playPause"),
  live: document.getElementById("live"),
  seek: document.getElementById("seek"),
  clock: document.getElementById("clock"),
  meter: document.getElementById("meter"),
  archiveNote: document.getElementById("archiveNote"),
  gaps: document.getElementById("gaps"),
  error: document.getElementById("error"),
};

const state = {
  manifest: null,
  mediaSource: null,
  sourceBuffer: null,
  sourceBufferReady: null,
  /** Sequence numbers already appended, so polling never double-appends. */
  appended: new Set(),
  /** Fetched but not yet appendable, because an earlier sequence is missing. */
  holding: new Map(),
  /** The next sequence the buffer will accept. Appending is strictly ordered. */
  nextSeq: 0,
  /** Maps playback position to event time, quality and holes. */
  timeline: [],
  /** Segments fetched but waiting for the SourceBuffer to be idle. */
  queue: [],
  appending: false,
  followLive: true,
  initialised: false,
  started: false,
  scrubbing: false,
};

function fail(message) {
  el.error.innerHTML = `<div class="notice err">${message}</div>`;
}

function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- manifest --

async function fetchManifest() {
  const res = await fetch(
    `/media/${encodeURIComponent(PRESENCE)}/manifest.json?t=${encodeURIComponent(TOKEN)}`,
    { cache: "no-store" },
  );
  if (res.status === 403) throw new Error("Ce lien n'est plus valable. Demandez-en un nouveau à la famille.");
  if (res.status === 404) throw new Error("Cet événement n'existe pas.");
  if (!res.ok) throw new Error("Impossible de charger l'événement.");
  return res.json();
}

// ------------------------------------------------------------------- media --

/**
 * Returns once the SourceBuffer is actually usable.
 *
 * `sourceopen` fires asynchronously, so a caller that checks for the buffer
 * immediately after construction always finds nothing. Handing back a promise
 * rather than relying on the next poll removes a whole class of "the first tick
 * silently did nothing" bugs.
 */
function ensureMediaSource(mimeType) {
  if (state.sourceBufferReady) return state.sourceBufferReady;

  if (!window.MediaSource || !MediaSource.isTypeSupported(mimeType)) {
    fail(
      `Votre navigateur ne peut pas lire ce format (${mimeType}). ` +
        `Essayez Chrome ou Firefox.`,
    );
    state.sourceBufferReady = Promise.resolve(null);
    return state.sourceBufferReady;
  }

  state.sourceBufferReady = new Promise((resolve) => {
    const ms = new MediaSource();
    state.mediaSource = ms;
    el.video.src = URL.createObjectURL(ms);

    ms.addEventListener("sourceopen", () => {
      try {
        const sb = ms.addSourceBuffer(mimeType);
        // Segments arrive in capture order and carry their own timestamps, so
        // the buffer appends them end to end rather than trying to place them.
        sb.mode = "sequence";
        sb.addEventListener("updateend", pump);
        sb.addEventListener("error", () => fail("Erreur de lecture du flux."));
        state.sourceBuffer = sb;
        pump();
        resolve(sb);
      } catch (err) {
        fail(`Impossible d'ouvrir le flux : ${err.message}`);
        resolve(null);
      }
    });
  });

  return state.sourceBufferReady;
}

/** Drains the fetched-segment queue into the SourceBuffer, one at a time. */
function pump() {
  const sb = state.sourceBuffer;
  if (!sb || sb.updating || state.queue.length === 0) return;
  const next = state.queue.shift();
  try {
    sb.appendBuffer(next);
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      // The buffer is full. Drop the oldest material we are not watching —
      // it is still on the server, so seeking back re-fetches it.
      const keepFrom = Math.max(0, el.video.currentTime - 30);
      if (sb.buffered.length > 0 && sb.buffered.start(0) < keepFrom) {
        try {
          sb.remove(sb.buffered.start(0), keepFrom);
        } catch {
          /* nothing safe to do */
        }
      }
      state.queue.unshift(next);
      return;
    }
    fail(`Erreur de lecture : ${err.message}`);
  }
}

async function fetchNewSegments(manifest) {
  // Always the video track, which carries audio too. When the ladder drops to
  // the audio floor the client stops producing video, and the overlay explains
  // why rather than leaving the viewer staring at a frozen frame.
  const list = manifest.segments.v ?? [];

  for (const seg of list) {
    if (state.appended.has(seg.seq) || state.holding.has(seg.seq)) continue;
    try {
      const res = await fetch(seg.url, { cache: "force-cache" });
      if (!res.ok) continue;
      state.holding.set(seg.seq, { buffer: await res.arrayBuffer(), meta: seg });
    } catch {
      // Transient; the next poll retries.
    }
  }

  drainInOrder(manifest);
}

/**
 * Appends strictly in sequence order, holding back anything that arrives early.
 *
 * The SourceBuffer runs in `sequence` mode, which lays segments end to end in
 * arrival order — so appending a backfilled segment from ten minutes ago after
 * the live edge would splice the past into the present. During a blackout the
 * correspondent prioritises live content, so out-of-order arrival is the normal
 * case, not an edge case.
 *
 * Holding back means playback stalls exactly at the moment the network failed,
 * which is the honest thing to show: that *is* where the hole is.
 */
function drainInOrder(manifest) {
  const listed = new Set((manifest.segments.v ?? []).map((s) => s.seq));
  const eventOver = manifest.state === "complete" || manifest.state === "ended";

  for (;;) {
    const held = state.holding.get(state.nextSeq);
    if (held) {
      state.holding.delete(state.nextSeq);
      state.appended.add(state.nextSeq);
      recordTimeline(held.meta);
      state.queue.push(held.buffer);
      state.nextSeq += 1;
      continue;
    }

    // A sequence the server will never have: skip it once the event is over,
    // rather than stalling the recording forever behind one lost segment.
    if (!listed.has(state.nextSeq) && eventOver && state.holding.size > 0) {
      state.nextSeq += 1;
      continue;
    }
    break;
  }
  pump();
}

/**
 * Maps playback position to what was happening at that moment of the event.
 *
 * Playback time and event time drift apart whenever content is missing: a
 * twenty-minute hole occupies zero seconds of the buffer. Recording the
 * relationship as segments are appended is the only way to answer "what was
 * going on when this was filmed?" later.
 */
function recordTimeline(meta) {
  const prev = state.timeline[state.timeline.length - 1];
  const expectedCapturedAt = prev ? prev.capturedAt + prev.coversSec : 0;
  const playbackStart = prev ? prev.playbackEnd : 0;

  state.timeline.push({
    playbackStart,
    playbackEnd: playbackStart + meta.coversSec,
    capturedAt: meta.capturedAt,
    coversSec: meta.coversSec,
    rung: meta.rung ?? 0,
    // Seconds of the event that are missing immediately before this segment.
    gapBefore: Math.max(0, meta.capturedAt - expectedCapturedAt),
  });
}

function atPlayhead(t) {
  const tl = state.timeline;
  for (let i = tl.length - 1; i >= 0; i--) {
    if (t >= tl[i].playbackStart) return tl[i];
  }
  return tl[0] ?? null;
}

// -------------------------------------------------------------- rendering ---

const RUNG_LABEL = [
  "720p", "480p", "360p", "240p", "180p", "photos", "audio seul", "coupé",
];

/**
 * What the viewer is told, and when.
 *
 * The rule that took a founder's bug report to get right: **the live status
 * describes now, and now is only relevant if you are watching now.** Painting
 * the correspondent's current state across historical playback told a viewer
 * at 0:04 that the connection was lost, when in fact it failed at 1:05 and
 * they had not reached it yet. Worse, it never went away.
 *
 * So: at the live edge, report live. Anywhere else, report what was happening
 * at the playhead — and surface an outage at the exact second it occurred.
 */
function renderStatus(manifest) {
  const nothingYet = state.timeline.length === 0;

  // A <video> with no decoded frame is just a black rectangle, and a black
  // rectangle with no caption reads as "broken". Say what is happening until
  // there is a picture to show.
  //   0 HAVE_NOTHING · 1 HAVE_METADATA · 2 HAVE_CURRENT_DATA
  if (!nothingYet && el.video.readyState < 2) {
    el.overlay.classList.add("show");
    el.overlayTitle.textContent = "Chargement…";
    el.overlaySub.textContent = manifest.live
      ? "Réception du direct depuis Brazzaville."
      : `Préparation de l'enregistrement — ${mmss(manifest.completeness.capturedSec)}.`;
    return;
  }

  if (nothingYet) {
    const waiting = manifest.state === "scheduled" || manifest.status.tone === "buffering";
    el.status.className = `tone-${manifest.status.tone}`;
    el.statusText.textContent = manifest.status.label;
    el.overlay.classList.toggle("show", waiting);
    el.overlayTitle.textContent = "En attente du correspondant";
    el.overlaySub.textContent = "L'événement n'a pas encore commencé.";
    return;
  }

  const here = atPlayhead(el.video.currentTime);
  const lastEnd = state.timeline[state.timeline.length - 1].playbackEnd;
  const atLiveEdge = manifest.live && lastEnd - el.video.currentTime <= 6;

  // Just crossed a hole: say so, here, once, with the time it happened.
  const crossing =
    here && here.gapBefore > 0 && el.video.currentTime - here.playbackStart < 4;

  if (crossing) {
    el.overlay.classList.add("show");
    el.overlayTitle.textContent = `Coupure réseau à ${mmss(here.capturedAt - here.gapBefore)}`;
    el.overlaySub.textContent =
      `${mmss(here.gapBefore)} n'a pas pu être transmis en direct. ` +
      (manifest.completeness.overallRatio >= 1
        ? "Ce passage est arrivé depuis — il est dans l'enregistrement."
        : "Le correspondant filmait toujours ; ce passage arrivera dès que le réseau le permet.");
  } else if (atLiveEdge && manifest.status.tone === "offline") {
    el.overlay.classList.add("show");
    el.overlayTitle.textContent = "Connexion perdue à Brazzaville";
    el.overlaySub.textContent =
      "Le correspondant continue de filmer. Tout sera livré dès que le réseau revient — vous ne perdez rien.";
  } else {
    el.overlay.classList.remove("show");
  }

  if (atLiveEdge) {
    el.status.className = `tone-${manifest.status.tone}`;
    el.statusText.textContent = manifest.status.label;
  } else if (here) {
    // Historical playback: describe the moment being watched, not this one.
    const quality = RUNG_LABEL[Math.min(RUNG_LABEL.length - 1, here.rung)];
    el.status.className = here.rung >= 5 ? "tone-degraded" : "tone-good";
    el.statusText.textContent = `Enregistrement · ${mmss(here.capturedAt)} · ${quality}`;
  }
}

/** Draws where the network failed, in playback time, under the scrubber. */
function renderGapMarkers() {
  const tl = state.timeline;
  if (tl.length === 0) return;
  const total = tl[tl.length - 1].playbackEnd || 1;

  const marks = tl
    .filter((e) => e.gapBefore > 0)
    .map((e) => {
      const left = (e.playbackStart / total) * 100;
      return (
        `<i style="left:${left.toFixed(2)}%" ` +
        `title="Coupure de ${mmss(e.gapBefore)} à ${mmss(e.capturedAt - e.gapBefore)}"></i>`
      );
    });

  el.gaps.innerHTML = marks.join("");
  el.gaps.hidden = marks.length === 0;
}

function renderArchive(manifest) {
  const c = manifest.completeness;
  const total = Math.max(1, c.capturedSec);

  // A single bar showing what the family will keep, with the holes drawn in.
  const audioGaps = c.gaps.filter((g) => g.track === "a").sort((a, b) => a.fromSec - b.fromSec);
  const parts = [];
  let cursor = 0;
  for (const g of audioGaps) {
    if (g.fromSec > cursor) parts.push(["have", g.fromSec - cursor]);
    parts.push(["gap", g.toSec - g.fromSec]);
    cursor = g.toSec;
  }
  if (cursor < total) parts.push(["have", total - cursor]);

  el.meter.innerHTML = parts
    .map(([kind, len]) => `<i class="${kind}" style="width:${((len / total) * 100).toFixed(2)}%"></i>`)
    .join("");

  const pct = (c.overallRatio * 100).toFixed(1);
  if (c.overallRatio >= 1) {
    el.archiveNote.textContent =
      manifest.state === "complete"
        ? `Enregistrement complet — ${mmss(c.capturedSec)}. La famille garde tout.`
        : `Tout est arrivé jusqu'ici — ${mmss(c.capturedSec)}.`;
  } else {
    const missing = c.capturedSec - c.audioSec;
    el.archiveNote.textContent =
      `${pct} % reçu. Il manque ${mmss(missing)}, qui arrivera dès que le réseau le permet — ` +
      `rien n'est perdu, c'est enregistré sur place.`;
  }
}

function renderSeek() {
  const sb = state.sourceBuffer;
  if (!sb || sb.buffered.length === 0) return;
  const end = sb.buffered.end(sb.buffered.length - 1);
  el.seek.max = String(Math.floor(end));
  if (!state.scrubbing) el.seek.value = String(Math.floor(el.video.currentTime));
  el.clock.textContent = `${mmss(el.video.currentTime)} / ${mmss(end)}`;

  // Following the live edge only means anything while there IS a live edge.
  // Applying it to a finished recording parked the playhead at 98% before the
  // viewer had watched a second of it: pressing play gave them the last two
  // seconds and an ending.
  const isLive = state.manifest?.live === true;
  if (isLive && state.followLive && !el.video.paused && end - el.video.currentTime > 6) {
    el.video.currentTime = Math.max(0, end - 1.5);
  }
  el.live.disabled = state.followLive;
}

/**
 * Shows only the controls that mean something for what is being watched.
 *
 * A finished recording has no live edge to return to, and nobody to speak to —
 * the ceremony ended hours ago. Offering "Parler" there is not a harmless extra
 * button; it promises something the product cannot do.
 */
function renderControls(manifest) {
  const isLive = manifest.live === true;
  el.talk.hidden = !isLive;
  el.live.hidden = !isLive;
  el.viewers.hidden = !isLive;
}

// ------------------------------------------------------------------- loop ---

async function tick() {
  try {
    const manifest = await fetchManifest();
    state.manifest = manifest;

    if (!state.initialised) {
      state.initialised = true;
      // A recording starts at the beginning. Only a live stream starts at the end.
      state.followLive = manifest.live === true;
    }
    renderControls(manifest);

    el.title.textContent = manifest.eventName;
    el.when.textContent = manifest.live
      ? "En direct"
      : manifest.state === "complete"
        ? "Enregistrement"
        : "Événement terminé";

    const mime = manifest.mimeType?.v;
    if (mime) await ensureMediaSource(mime);
    if (state.sourceBuffer) await fetchNewSegments(manifest);

    renderStatus(manifest);
    renderArchive(manifest);
    renderGapMarkers();
    renderSeek();

    // Stop polling only when the event is over AND every segment the manifest
    // lists has actually been appended. Checking the presence state alone let
    // the player exit on its very first tick — before the SourceBuffer existed
    // — and sit there showing "recording complete" over an empty screen.
    const listed = (manifest.segments.v ?? []).length;
    const haveAll = listed > 0 && state.appended.size >= listed && state.holding.size === 0;
    if (manifest.state === "complete" && haveAll && state.queue.length === 0) {
      if (state.mediaSource?.readyState === "open" && !state.sourceBuffer?.updating) {
        try {
          state.mediaSource.endOfStream();
        } catch {
          /* already ended */
        }
      }
      return;
    }
  } catch (err) {
    fail(err.message);
    return;
  }
  setTimeout(tick, POLL_MS);
}

// --------------------------------------------------------------- controls ---

el.playPause.addEventListener("click", async () => {
  if (el.video.paused) {
    try {
      // Pressing play on a finished recording should replay it, not sit at the
      // end doing nothing.
      if (el.video.ended || el.video.currentTime >= el.video.duration - 0.3) {
        el.video.currentTime = 0;
      }
      await el.video.play();
      state.started = true;
      el.playPause.textContent = "Pause";
    } catch {
      fail("La lecture a été bloquée par le navigateur. Touchez à nouveau Lecture.");
    }
  } else {
    el.video.pause();
    el.playPause.textContent = "Lecture";
  }
});

el.video.addEventListener("play", () => (el.playPause.textContent = "Pause"));
el.video.addEventListener("pause", () => (el.playPause.textContent = "Lecture"));
el.video.addEventListener("timeupdate", () => {
  renderSeek();
  // The overlay depends on where the playhead is, so it has to update as the
  // playhead moves — not once every two seconds when the manifest is polled.
  if (state.manifest) renderStatus(state.manifest);
});

el.seek.addEventListener("input", () => {
  state.scrubbing = true;
  state.followLive = false;
});
el.seek.addEventListener("change", () => {
  el.video.currentTime = Number(el.seek.value);
  state.scrubbing = false;
});

el.live.addEventListener("click", () => {
  state.followLive = true;
  const sb = state.sourceBuffer;
  if (sb && sb.buffered.length > 0) {
    el.video.currentTime = Math.max(0, sb.buffered.end(sb.buffered.length - 1) - 1);
  }
});

el.talk.addEventListener("click", () => {
  // Talk mode is a separate real-time sub-session (docs/02). The signalling and
  // SFU are not built; this is the request surface it will hang off.
  el.talk.disabled = true;
  el.talk.textContent = "Demandé…";
  el.overlay.classList.add("show");
  el.overlayTitle.textContent = "Demande envoyée";
  el.overlaySub.textContent =
    "Le correspondant va être prévenu que vous voulez dire un mot. (Talk mode n'est pas encore branché.)";
  setTimeout(() => {
    el.overlay.classList.remove("show");
    el.talk.disabled = false;
    el.talk.textContent = "Parler";
  }, 3500);
});

// ------------------------------------------------------------------ start ---

if (!PRESENCE || !TOKEN) {
  fail("Lien incomplet. Ouvrez le lien envoyé par la famille.");
} else {
  tick();
}

// Exposed so the end-to-end test can assert on real playback state rather than
// scraping the DOM for it.
window.__elongo = state;
