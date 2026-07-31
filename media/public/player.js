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
  error: document.getElementById("error"),
};

const state = {
  manifest: null,
  mediaSource: null,
  sourceBuffer: null,
  sourceBufferReady: null,
  /** Sequence numbers already appended, so polling never double-appends. */
  appended: new Set(),
  /** Segments fetched but waiting for the SourceBuffer to be idle. */
  queue: [],
  appending: false,
  followLive: true,
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
    if (state.appended.has(seg.seq)) continue;
    state.appended.add(seg.seq);
    try {
      const res = await fetch(seg.url, { cache: "force-cache" });
      if (!res.ok) {
        state.appended.delete(seg.seq);
        continue;
      }
      state.queue.push(await res.arrayBuffer());
      pump();
    } catch {
      // Transient: forget it so the next poll retries.
      state.appended.delete(seg.seq);
    }
  }
}

// -------------------------------------------------------------- rendering ---

function renderStatus(manifest) {
  const s = manifest.status;
  el.status.className = `tone-${s.tone}`;
  el.statusText.textContent = s.label;

  const offline = s.tone === "offline";
  const waiting = s.tone === "buffering" && state.appended.size === 0;

  if (offline || waiting) {
    el.overlay.classList.add("show");
    el.overlayTitle.textContent = offline ? "Connexion perdue à Brazzaville" : "En attente du correspondant";
    el.overlaySub.textContent = offline
      ? "Le correspondant continue de filmer. Tout sera livré dès que le réseau revient — vous ne perdez rien."
      : "L'événement n'a pas encore commencé.";
  } else {
    el.overlay.classList.remove("show");
  }
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

  // Following the live edge means staying near the end of what has arrived.
  if (state.followLive && !el.video.paused && end - el.video.currentTime > 6) {
    el.video.currentTime = Math.max(0, end - 1.5);
  }
  el.live.disabled = state.followLive;
}

// ------------------------------------------------------------------- loop ---

async function tick() {
  try {
    const manifest = await fetchManifest();
    state.manifest = manifest;

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
    renderSeek();

    // Stop polling only when the event is over AND every segment the manifest
    // lists has actually been appended. Checking the presence state alone let
    // the player exit on its very first tick — before the SourceBuffer existed
    // — and sit there showing "recording complete" over an empty screen.
    const listed = (manifest.segments.v ?? []).length;
    const haveAll = listed > 0 && state.appended.size >= listed;
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
el.video.addEventListener("timeupdate", renderSeek);

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
