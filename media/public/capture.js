/**
 * The correspondent's capture client.
 *
 * This is the browser version. It runs on Android Chrome with no install, which
 * makes it the right thing to put in a correspondent's hands for the first
 * hundred events; the native client in docs/06 is a later port, and it earns
 * its keep through background upload, dual-SIM bonding and real encoder control.
 *
 * The architecture from docs/06 survives intact:
 *
 *   capture → IndexedDB → priority uploader → network
 *
 * Content is durable *before* the network is involved. That inversion is what
 * turns "the moment is gone forever" into "everything arrives, some of it late",
 * and it is the reason the refund guarantee in docs/05 is affordable.
 *
 * ONE HONEST LIMITATION. MediaRecorder cannot change bitrate once started, so
 * the ladder here is an *upload* policy rather than an *encode* policy: at the
 * audio floor we stop sending video and keep it on the device, instead of
 * encoding smaller video. The viewer experience is the same — sound continues,
 * the picture holds, everything backfills — but the data bundle is not saved
 * the way a native encoder would save it. That gap is the strongest single
 * argument for the native app, and it is worth measuring before building it.
 */

// ------------------------------------------------------------------ config --

const SEGMENT_MS = 2000;
/** Content younger than this is the live edge; older is backfill. */
const LIVE_WINDOW_SEC = 15;
const PROGRESS_MS = 3000;
const RECONCILE_MS = 15000;

/** Mirrors prototype/src/encoder/ladder.ts, expressed as upload policy. */
const RUNGS = [
  { i: 0, name: "720p30", video: true },
  { i: 1, name: "480p24", video: true },
  { i: 2, name: "360p20", video: true },
  { i: 3, name: "240p15", video: true },
  { i: 4, name: "180p12", video: true },
  { i: 5, name: "photo call", video: true },
  { i: 6, name: "audio only", video: false },
  { i: 7, name: "buffered", video: false },
];

const FLOOR = 6;
const BUFFERED = 7;

// -------------------------------------------------------------------- dom --

const $ = (id) => document.getElementById(id);
const el = {
  presenceId: $("presenceId"), captureKey: $("captureKey"), devCreate: $("devCreate"),
  setupHint: $("setupHint"), setupLink: $("setupLink"), c1: $("c1"), c2: $("c2"), c3: $("c3"),
  preview: $("preview"), screenOff: $("screenOff"), screenToggle: $("screenToggle"),
  start: $("start"), stop: $("stop"), pause: $("pause"), rungLine: $("rungLine"),
  statCaptured: $("statCaptured"), statSent: $("statSent"), statBacklog: $("statBacklog"),
  statBattery: $("statBattery"), statUplink: $("statUplink"), statComplete: $("statComplete"),
  simOffline: $("simOffline"), simSlow: $("simSlow"), error: $("error"),
  donePanel: $("donePanel"), doneTitle: $("doneTitle"), doneStatus: $("doneStatus"),
  doneMeter: $("doneMeter"), doneLink: $("doneLink"),
};

function fail(message) {
  el.error.innerHTML = `<div class="notice err">${message}</div>`;
}

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------- durable segment store --

/**
 * IndexedDB, not memory. A correspondent's phone will be backgrounded, run out
 * of battery, or have Chrome killed by Android to reclaim memory — and none of
 * those may cost the family their wedding.
 */
const DB_NAME = "elongo-capture";
let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore("segments", { keyPath: "key" });
      store.createIndex("pending", ["presenceId", "sent"], { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode) {
  return db.transaction("segments", mode).objectStore("segments");
}

function put(record) {
  return new Promise((resolve, reject) => {
    const req = tx("readwrite").put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function allSegments(presenceId) {
  return new Promise((resolve, reject) => {
    const req = tx("readonly").getAll();
    req.onsuccess = () => resolve(req.result.filter((r) => r.presenceId === presenceId));
    req.onerror = () => reject(req.error);
  });
}

async function markSent(key) {
  const store = tx("readwrite");
  const got = await new Promise((resolve) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
  if (got) await put({ ...got, sent: true });
}

// ------------------------------------------------------------------ state --

const state = {
  presenceId: "",
  captureKey: "",
  running: false,
  paused: false,
  startedAtMs: 0,
  capturedSec: 0,
  seq: { a: 0, v: 0 },
  rung: 1,
  /** Throughput estimate, kbps. */
  estimateKbps: 800,
  sentCount: 0,
  backlogCount: 0,
  batteryPct: null,
  screenOn: true,
  uploading: false,
  completeness: null,
  stableSec: 0,
  viewerLink: "",
  finishing: false,
};

// --------------------------------------------------------------- recording --

let videoRecorder = null;
let audioRecorder = null;
let stream = null;

function pickMime(candidates) {
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

async function startCapture() {
  state.presenceId = el.presenceId.value.trim();
  state.captureKey = el.captureKey.value.trim();

  if (!state.presenceId || !state.captureKey) {
    return fail("Il faut la référence de l'événement et la clé du correspondant.");
  }
  if (!(el.c1.checked && el.c2.checked && el.c3.checked)) {
    // docs/05: no consent, no Presence, and the customer is refunded in full.
    return fail("L'accord de la famille est obligatoire avant de filmer.");
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    return fail(`Impossible d'accéder à la caméra : ${err.message}`);
  }

  el.preview.srcObject = stream;
  el.preview.play().catch(() => {});

  const videoMime = pickMime([
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ]);
  const audioMime = pickMime(["audio/webm;codecs=opus", "audio/webm"]);
  if (!videoMime) return fail("Ce navigateur ne sait pas enregistrer de vidéo.");

  db = await openDb();

  const open = await fetch(`/ingest/${encodeURIComponent(state.presenceId)}/open`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-elongo-key": state.captureKey },
    body: JSON.stringify({ mimeType: { v: videoMime, a: audioMime } }),
  });
  if (!open.ok) {
    return fail(
      open.status === 401
        ? "Clé du correspondant incorrecte. Utilisez « créer un événement de démonstration » pour en obtenir une."
        : "Référence inconnue. Vérifiez la référence de l'événement.",
    );
  }
  rememberKey(state.presenceId, state.captureKey);
  el.error.innerHTML = "";

  // Two recorders, mirroring the separate tracks in docs/06: audio is the
  // payload and must survive independently of the picture.
  videoRecorder = new MediaRecorder(stream, { mimeType: videoMime, videoBitsPerSecond: 900_000 });
  videoRecorder.ondataavailable = (e) => onChunk("v", e.data);
  videoRecorder.start(SEGMENT_MS);

  const audioOnly = new MediaStream(stream.getAudioTracks());
  audioRecorder = new MediaRecorder(audioOnly, { mimeType: audioMime, audioBitsPerSecond: 24_000 });
  audioRecorder.ondataavailable = (e) => onChunk("a", e.data);
  audioRecorder.start(SEGMENT_MS);

  state.running = true;
  state.startedAtMs = Date.now();
  el.start.disabled = true;
  el.stop.disabled = false;
  el.pause.disabled = false;

  watchBattery();
  uploadLoop();
  progressLoop();
  reconcileLoop();
  render();
}

async function onChunk(track, blob) {
  if (!blob || blob.size === 0) return;
  // Everything captured lands on the device before any network attempt. This
  // is the one line the whole guarantee rests on.
  const seq = state.seq[track]++;
  const coversSec = SEGMENT_MS / 1000;
  // The chunk is DELIVERED at the end of its timeslice but CONTAINS the window
  // that just elapsed. Timestamping it with the wall clock at delivery pushes
  // every segment one slice late and leaves a permanent hole at the start of
  // the event — which showed up as a stubborn 80% completeness that no amount
  // of backfilling could close.
  const capturedAt = seq * coversSec;
  state.capturedSec = Math.max(state.capturedSec, capturedAt + coversSec);

  await put({
    key: `${state.presenceId}:${track}:${seq}`,
    presenceId: state.presenceId,
    track,
    seq,
    capturedAt,
    coversSec,
    bytes: blob.size,
    blob,
    sent: false,
    rung: state.rung,
  });
}

async function stopCapture() {
  // Order matters: stop the recorders first so their final chunks are captured,
  // and only then leave the running state. Flipping `running` first raced the
  // upload loop into exiting before the last seconds were stored.
  videoRecorder?.stop();
  audioRecorder?.stop();
  await new Promise((r) => setTimeout(r, 400));

  state.running = false;
  state.finishing = true;
  stream?.getTracks().forEach((t) => t.stop());
  el.stop.disabled = true;
  el.pause.disabled = true;
  el.start.disabled = false;

  // Tell the server the camera has stopped. Without this the presence stays
  // "live" forever, so the player keeps treating the archive as an ongoing
  // broadcast and shows the correspondent's last live status over playback.
  try {
    await fetch(`/ingest/${encodeURIComponent(state.presenceId)}/close`, {
      method: "POST",
      headers: { "x-elongo-key": state.captureKey },
    });
  } catch {
    // Offline at the moment of stopping: the drain loop below retries via
    // /status, and the server promotes the presence once everything arrives.
  }

  el.donePanel.hidden = false;
  await ensureViewerLink();
  drainLoop();
}

/**
 * After the camera stops, the upload has not.
 *
 * The correspondent needs to see the backlog draining and be told when it is
 * safe to close the page — otherwise "Terminer" looks like it did nothing,
 * which is exactly what it looked like.
 */
async function drainLoop() {
  while (state.finishing) {
    let done = null;
    try {
      const res = await fetch(`/ingest/${encodeURIComponent(state.presenceId)}/status`, {
        headers: { "x-elongo-key": state.captureKey },
      });
      if (res.ok) {
        const status = await res.json();
        state.completeness = status.completeness;
        done = status.completeness.overallRatio;
      }
    } catch {
      /* offline; keep trying */
    }

    const outstanding = state.backlogCount;
    const pct = done === null ? null : Math.round(done * 100);

    if (outstanding === 0 && done !== null && done >= 1) {
      el.doneTitle.textContent = "Envoi terminé";
      el.doneStatus.textContent =
        `L'enregistrement complet est arrivé — ${mmss(state.capturedSec)}. ` +
        `Vous pouvez fermer cette page.`;
      el.doneMeter.innerHTML = '<i class="have" style="width:100%"></i>';
      state.finishing = false;
      render();
      return;
    }

    el.doneTitle.textContent = "Envoi en cours…";
    el.doneStatus.textContent =
      `${outstanding} morceau${outstanding === 1 ? "" : "x"} en attente` +
      (pct === null ? "" : ` · ${pct} % reçu`) +
      ". Rien n'est perdu — tout est déjà enregistré sur le téléphone.";
    el.doneMeter.innerHTML =
      `<i class="have" style="width:${pct ?? 0}%"></i>` +
      `<i class="gap" style="width:${100 - (pct ?? 0)}%"></i>`;

    render();
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** The link the family would receive. In production this comes from booking. */
async function ensureViewerLink() {
  if (!state.viewerLink) {
    try {
      const res = await fetch(`/dev/token?id=${encodeURIComponent(state.presenceId)}`);
      if (res.ok) {
        const { token } = await res.json();
        state.viewerLink =
          `${location.origin}/player.html?id=${encodeURIComponent(state.presenceId)}` +
          `&t=${encodeURIComponent(token)}`;
      }
    } catch {
      /* leave it blank rather than showing a broken link */
    }
  }
  if (state.viewerLink) {
    el.doneLink.href = state.viewerLink;
    el.doneLink.hidden = false;
  } else {
    el.doneLink.hidden = true;
  }
}

// ---------------------------------------------------------------- uploader --

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Priority order from docs/06: live audio, live video, backfill audio,
 * backfill video. Backfill only ever uses what the live edge leaves behind, so
 * repairing a twenty-minute-old gap never damages the stream happening now.
 */
function priority(seg, nowSec) {
  const live = nowSec - seg.capturedAt <= LIVE_WINDOW_SEC;
  if (seg.track === "a") return live ? 0 : 2;
  return live ? 1 : 3;
}

async function uploadLoop() {
  if (state.uploading) return; // one loop only; a second caller just leaves
  state.uploading = true;
  try {
    while (state.running || state.finishing || state.backlogCount > 0) {
      try {
        await uploadPass();
      } catch {
        /* transient; the next pass retries */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  } finally {
    // Without this the flag stays true after any throw and the loop can never
    // be restarted — the client would go quiet for the rest of the event.
    state.uploading = false;
  }
}

async function uploadPass() {
  if (!db) return;
  const all = await allSegments(state.presenceId);
  const pending = all.filter((s) => !s.sent);
  state.backlogCount = pending.length;
  state.sentCount = all.length - pending.length;

  if (el.simOffline.checked) {
    // The camera keeps rolling; only the network is gone. This is the whole
    // point of the design, and the demo switch that proves it.
    setRung(BUFFERED);
    state.stableSec = 0;
    render();
    return;
  }

  const nowSec = Math.floor((Date.now() - state.startedAtMs) / 1000);
  pending.sort((a, b) => priority(a, nowSec) - priority(b, nowSec) || a.capturedAt - b.capturedAt);

  // Two different reasons video might not go, and they are not the same thing:
  //
  //   audioOnlyLink  the link genuinely cannot carry video at all, so nothing
  //                  video-shaped moves, live or backfill.
  //   liveVideoHeld  the ladder is holding the live picture back, but backfill
  //                  still flows on whatever capacity the live edge left.
  //
  // Conflating them is what deadlocked the client: at the buffered rung no
  // video was sent at all, so the video backlog never drained, so the backlog
  // stayed deep, so the ladder never left the buffered rung.
  const audioOnlyLink = el.simSlow.checked;
  const liveVideoHeld = !RUNGS[state.rung].video;
  let sentBytes = 0;
  const started = Date.now();

  for (const seg of pending.slice(0, 12)) {
    const isLive = nowSec - seg.capturedAt <= LIVE_WINDOW_SEC;
    if (seg.track === "v" && (audioOnlyLink || (isLive && liveVideoHeld))) continue;
    const buffer = await seg.blob.arrayBuffer();
    const res = await fetch(
      `/ingest/${encodeURIComponent(state.presenceId)}/${seg.track}/${seg.seq}`,
      {
        method: "PUT",
        headers: {
          "x-elongo-key": state.captureKey,
          "x-captured-at": String(seg.capturedAt),
          "x-covers-sec": String(seg.coversSec),
          "x-rung": String(seg.rung ?? state.rung),
          "x-segment-sha256": await sha256Hex(buffer),
          "content-type": "application/octet-stream",
        },
        body: buffer,
      },
    );
    // 200 duplicate and 201 stored are both success: a retry after an
    // ambiguous failure must not look like an error.
    if (res.ok) {
      await markSent(seg.key);
      sentBytes += seg.bytes;
    } else if (res.status === 409 || res.status === 422) {
      // Conflicting or corrupt: re-sending will not help. Drop it rather than
      // blocking the queue behind it forever.
      await markSent(seg.key);
    } else {
      break;
    }
  }

  const elapsed = Math.max(0.25, (Date.now() - started) / 1000);
  const kbps = (sentBytes * 8) / 1000 / elapsed;
  const queueLimited = pending.length <= 2;
  updateLadder(kbps, queueLimited, pending);
}

// ------------------------------------------------------------------ ladder --

/**
 * The three lessons from prototype/src/encoder/controller.ts, which the
 * simulation taught us before any of this existed:
 *
 *   - The latency budget is the resilience budget. A shallow queue is healthy.
 *   - Throughput is only a measurement when the link was the limit; otherwise
 *     probe upward, or the client sits at the floor forever after one dropout.
 *   - An outage is not a bandwidth sample.
 */
function updateLadder(kbps, queueLimited, pending) {
  if (kbps <= 0 && !queueLimited) {
    state.estimateKbps = Math.max(state.estimateKbps, 24);
  } else if (queueLimited) {
    state.estimateKbps = Math.max(state.estimateKbps, kbps, 24) * 1.06;
  } else {
    state.estimateKbps = 0.7 * state.estimateKbps + 0.3 * kbps;
  }

  const nowSec = Math.floor((Date.now() - state.startedAtMs) / 1000);

  // Only the LIVE edge counts toward congestion. An hour of historical backlog
  // draining in the background is not a reason to degrade the picture happening
  // right now — and measuring it here is what pinned the ladder at the buffered
  // rung permanently after any outage, because the backlog is by definition old.
  //
  // prototype/src/pipeline/store.ts already knew this; this file did not.
  const liveOldest = pending
    .filter((s) => nowSec - s.capturedAt <= LIVE_WINDOW_SEC)
    .reduce((min, s) => Math.min(min, s.capturedAt), nowSec);
  const backlogSec = nowSec - liveOldest;

  if (el.simSlow.checked) return setRung(FLOOR);

  if (backlogSec > 20) {
    setRung(Math.min(BUFFERED, state.rung + 1));
    state.stableSec = 0;
  } else if (backlogSec > 9) {
    state.stableSec = 0;
  } else {
    state.stableSec += 1;
    if (state.stableSec > 3 && state.rung > 0) {
      // Climb straight to the rung the link supports rather than one step at a
      // time: after a blackout, stepping would take minutes to look recovered.
      const target = state.estimateKbps > 600 ? 1 : state.estimateKbps > 250 ? 3 : FLOOR;
      setRung(Math.max(target, powerCap()));
      state.stableSec = 0;
    }
  }
}

function setRung(next) {
  state.rung = Math.max(0, Math.min(BUFFERED, next));
}

/**
 * Power budget. A video call knows the battery level; it does not know the
 * event runs until six o'clock, so it cannot plan. Reaching the end at 360p
 * beats two hours of 720p followed by silence.
 */
function powerCap() {
  if (state.batteryPct === null) return 0;
  if (state.batteryPct < 12) return FLOOR;
  if (state.batteryPct < 25) return 4;
  if (state.batteryPct < 40) return 2;
  return 0;
}

async function watchBattery() {
  if (!navigator.getBattery) return;
  try {
    const battery = await navigator.getBattery();
    const read = () => {
      state.batteryPct = Math.round(battery.level * 100);
      // The screen is usually the largest single draw, and the correspondent is
      // watching the wedding rather than the handset.
      if (state.batteryPct < 25 && state.screenOn) setScreen(false);
    };
    read();
    battery.addEventListener("levelchange", read);
  } catch {
    /* not available; the ladder simply loses one input */
  }
}

// --------------------------------------------------------- server dialogue --

async function progressLoop() {
  while (state.running) {
    try {
      const res = await fetch(`/ingest/${encodeURIComponent(state.presenceId)}/progress`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-elongo-key": state.captureKey },
        body: JSON.stringify({
          capturedThroughSec: state.capturedSec,
          telemetry: {
            rung: state.rung,
            rungName: RUNGS[state.rung].name,
            batteryPct: state.batteryPct,
            uplinkKbps: state.estimateKbps,
            backlogSec: state.backlogCount * (SEGMENT_MS / 1000),
            screenOn: state.screenOn,
          },
        }),
      });
      if (res.ok) state.completeness = (await res.json()).completeness;
    } catch {
      /* offline; the next pass will catch up */
    }
    render();
    await new Promise((r) => setTimeout(r, PROGRESS_MS));
  }
}

/**
 * Reconciliation. After a blackout, ask what actually arrived and re-send only
 * the difference — the alternative is re-uploading everything and burning the
 * data bundle we paid for, or assuming success and losing content.
 */
async function reconcileLoop() {
  while (state.running) {
    await new Promise((r) => setTimeout(r, RECONCILE_MS));
    if (el.simOffline.checked) continue;
    try {
      const res = await fetch(`/ingest/${encodeURIComponent(state.presenceId)}/status`, {
        headers: { "x-elongo-key": state.captureKey },
      });
      if (!res.ok) continue;
      const status = await res.json();
      const have = { a: new Set(status.received.a), v: new Set(status.received.v) };
      for (const seg of await allSegments(state.presenceId)) {
        // The server has it but we think we do not: mark it done.
        if (!seg.sent && have[seg.track].has(seg.seq)) await markSent(seg.key);
      }
    } catch {
      /* offline */
    }
  }
}

// --------------------------------------------------------------- rendering --

function setScreen(on) {
  state.screenOn = on;
  el.screenToggle.checked = on;
  el.screenOff.classList.toggle("show", !on);
  el.preview.style.visibility = on ? "visible" : "hidden";
}

function render() {
  el.statCaptured.textContent = mmss(state.capturedSec);
  el.statSent.textContent = String(state.sentCount);
  el.statBacklog.textContent = String(state.backlogCount);
  el.statBattery.textContent = state.batteryPct === null ? "—" : `${state.batteryPct}%`;
  el.statUplink.textContent = `${Math.round(state.estimateKbps)}k`;
  el.statComplete.textContent = state.completeness
    ? `${(state.completeness.overallRatio * 100).toFixed(0)}%`
    : "—";

  const rung = RUNGS[state.rung];
  el.rungLine.textContent =
    state.rung >= BUFFERED
      ? "Réseau coupé — on continue de filmer, rien n'est perdu"
      : `${rung.name}${rung.video ? "" : " — audio seul"}`;
}

// --------------------------------------------------------------- controls ---

el.start.addEventListener("click", startCapture);
el.stop.addEventListener("click", stopCapture);

el.pause.addEventListener("click", () => {
  // docs/05: reachable one-handed, cuts image and sound instantly, because an
  // elder saying "stop" outranks the person paying.
  state.paused = !state.paused;
  stream?.getTracks().forEach((t) => (t.enabled = !state.paused));
  el.pause.textContent = state.paused ? "Reprendre" : "Pause";
});

el.screenToggle.addEventListener("change", () => setScreen(el.screenToggle.checked));

el.devCreate.addEventListener("click", async () => {
  const id = el.presenceId.value.trim() || "demo";
  try {
    const res = await fetch("/dev/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, eventName: "Mariage de Grace & Thierry" }),
    });
    if (!res.ok) return fail("Impossible de créer l'événement de démonstration.");
    const body = await res.json();
    el.captureKey.value = body.captureKey;
    rememberKey(id, body.captureKey);
    state.viewerLink =
      `${location.origin}/player.html?id=${encodeURIComponent(id)}` +
      `&t=${encodeURIComponent(body.viewerToken)}`;
    // Write into a dedicated element rather than replacing setupHint's HTML,
    // which used to destroy this very button — so it worked exactly once, and
    // a reload left no way to recover the key.
    el.setupLink.innerHTML =
      `Lien pour la famille : <a href="${state.viewerLink}" target="_blank" rel="noopener">ouvrir le lecteur</a>`;
  } catch (err) {
    fail(`Impossible de créer l'événement : ${err.message}`);
  }
});

/**
 * Keys survive a reload.
 *
 * A correspondent whose browser reloads mid-event — Android is aggressive about
 * this — must not be locked out of their own booking. The key is scoped to the
 * reference so switching events does not silently reuse the wrong one.
 */
function rememberKey(id, key) {
  try {
    localStorage.setItem(`elongo.key.${id}`, key);
  } catch {
    /* private browsing; the field still holds it for this session */
  }
}

function recallKey(id) {
  try {
    return localStorage.getItem(`elongo.key.${id}`) ?? "";
  } catch {
    return "";
  }
}

function restoreKeyForReference() {
  const id = el.presenceId.value.trim();
  if (!id) return;
  const saved = recallKey(id);
  if (saved && !el.captureKey.value.trim()) el.captureKey.value = saved;
}

el.presenceId.addEventListener("change", restoreKeyForReference);
restoreKeyForReference();

setScreen(true);
render();

window.__elongoCapture = state;
