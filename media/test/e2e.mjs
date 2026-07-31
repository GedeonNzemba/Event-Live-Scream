#!/usr/bin/env node
/**
 * End-to-end: a real browser records real media, uploads it through the real
 * ingest API, and a second browser tab plays it back.
 *
 *   node test/e2e.mjs
 *
 * Chromium's fake capture device stands in for the correspondent's camera, so
 * the getUserMedia → MediaRecorder → IndexedDB → upload path is genuinely
 * exercised rather than mocked. What this cannot test is a real phone on a real
 * Congolese cell; that is what the ten events in docs/07 are for.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const MEDIA_DIR = mkdtempSync(join(tmpdir(), "elongo-e2e-"));
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${mark}  ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  if (!ok) failures++;
}

const server = spawn(process.execPath, ["src/server.ts"], {
  env: {
    ...process.env,
    PORT: String(PORT),
    ELONGO_MEDIA_DIR: MEDIA_DIR,
    ELONGO_TOKEN_SECRET: "e2e-secret",
  },
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/dev/presences`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("media server did not start");
}

function cleanup() {
  server.kill();
  rmSync(MEDIA_DIR, { recursive: true, force: true });
}

let browser;
try {
  await waitForServer();
  console.log("\n  \x1b[1mEnd-to-end: camera → upload → playback\x1b[0m");
  console.log("  \x1b[2m" + "─".repeat(66) + "\x1b[0m\n");

  browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const context = await browser.newContext({ permissions: ["camera", "microphone"] });

  // ---- capture ----------------------------------------------------------
  const cap = await context.newPage();
  const capErrors = [];
  cap.on("pageerror", (e) => capErrors.push(e.message));
  await cap.goto(`${BASE}/capture.html`);

  await cap.fill("#presenceId", "e2etest");
  await cap.click("#devCreate");
  await cap.waitForFunction(() => document.getElementById("captureKey").value.length > 0);

  const captureKey = await cap.inputValue("#captureKey");
  check("capture client provisions a presence", captureKey.length > 20);

  // Consent is a hard gate before the camera starts (docs/05).
  await cap.click("#start");
  await cap.waitForTimeout(400);
  const blocked = await cap.textContent("#error");
  check("refuses to film without the family's consent", /accord de la famille/i.test(blocked ?? ""));

  await cap.check("#c1");
  await cap.check("#c2");
  await cap.check("#c3");
  await cap.click("#start");

  await cap.waitForFunction(() => window.__elongoCapture?.running === true, { timeout: 15000 });
  check("camera starts once consent is given", true);

  // Record for a while so several segments exist.
  await cap.waitForFunction(() => window.__elongoCapture?.sentCount >= 3, { timeout: 30000 });
  const afterUpload = await cap.evaluate(() => ({ ...window.__elongoCapture }));
  check("segments reach the server", afterUpload.sentCount >= 3, `${afterUpload.sentCount} sent`);

  // ---- the blackout -----------------------------------------------------
  await cap.check("#simOffline");
  const beforeOutage = await cap.evaluate(() => window.__elongoCapture.capturedSec);
  await cap.waitForTimeout(6000);
  const duringOutage = await cap.evaluate(() => ({ ...window.__elongoCapture }));

  check(
    "camera keeps filming while the network is gone",
    duringOutage.capturedSec > beforeOutage,
    `${beforeOutage}s → ${duringOutage.capturedSec}s`,
  );
  check("backlog builds on the device instead of being lost", duringOutage.backlogCount > 0,
    `${duringOutage.backlogCount} segments held`);
  check("status drops to the buffered rung", duringOutage.rung >= 7);

  // ---- recovery ---------------------------------------------------------
  await cap.uncheck("#simOffline");
  await cap.waitForFunction(() => window.__elongoCapture.backlogCount <= 1, { timeout: 40000 });
  const recovered = await cap.evaluate(() => ({ ...window.__elongoCapture }));
  check(
    "everything held during the blackout backfills",
    recovered.backlogCount <= 1,
    `${recovered.sentCount} sent, ${recovered.backlogCount} outstanding`,
  );

  // The ladder must actually leave the buffered rung once the link returns.
  // It did not: backlog age was measured over all pending segments including
  // backfill, which is old by definition, so the client stayed pinned at
  // "network cut" for the rest of the event however good the network got.
  await cap.waitForFunction(() => window.__elongoCapture.rung < 7, { timeout: 30000 })
    .then(() => check("ladder leaves the buffered rung after recovery", true))
    .catch(async () => {
      const st = await cap.evaluate(() => ({ ...window.__elongoCapture }));
      check("ladder leaves the buffered rung after recovery", false,
        `stuck at rung ${st.rung}, backlog ${st.backlogCount}`);
    });

  const recoveredRung = await cap.evaluate(() => window.__elongoCapture.rung);
  check("status stops saying the network is cut", recoveredRung < 7, `rung ${recoveredRung}`);

  // ---- the slow-link mode -----------------------------------------------
  // "Very slow network" means the link cannot carry video at all — not merely
  // that the live picture is held back — so no video should move while it is on.
  const videoBefore = await cap.evaluate(() => window.__elongoCapture.sentCount);
  await cap.check("#simSlow");
  await cap.waitForTimeout(7000);
  const slow = await cap.evaluate(() => ({ ...window.__elongoCapture }));
  check("slow link drops to the audio floor", slow.rung >= 6, `rung ${slow.rung}`);
  check("audio still gets through on a slow link", slow.sentCount > videoBefore,
    `${slow.sentCount - videoBefore} segments sent while degraded`);

  await cap.uncheck("#simSlow");
  await cap.waitForFunction(() => window.__elongoCapture.rung < 6, { timeout: 30000 })
    .then(() => check("recovers from the slow link too", true))
    .catch(async () => {
      const st = await cap.evaluate(() => ({ ...window.__elongoCapture }));
      check("recovers from the slow link too", false, `stuck at rung ${st.rung}`);
    });

  // ---- finishing --------------------------------------------------------
  await cap.click("#stop");

  // Pressing Terminer must visibly do something: a panel, a draining backlog,
  // and a link to watch what was just filmed.
  await cap.waitForSelector("#donePanel:not([hidden])", { timeout: 10000 });
  check("pressing Terminer shows what is happening", true);

  await cap.waitForFunction(
    () => document.getElementById("doneTitle")?.textContent?.includes("terminé"),
    { timeout: 60000 },
  );
  const doneStatus = await cap.textContent("#doneStatus");
  check("tells the correspondent when it is safe to close", /fermer cette page/i.test(doneStatus ?? ""),
    (doneStatus ?? "").slice(0, 58));

  const doneHref = await cap.getAttribute("#doneLink", "href");
  check("offers a link to watch what was filmed", Boolean(doneHref && doneHref.includes("player.html")),
    doneHref ? "player link present" : "no link");

  // ---- server-side truth ------------------------------------------------
  const tokenRes = await fetch(`${BASE}/dev/token?id=e2etest`);
  const { token } = await tokenRes.json();
  const manifest = await (
    await fetch(`${BASE}/media/e2etest/manifest.json?t=${encodeURIComponent(token)}`)
  ).json();

  check("server holds audio and video segments",
    manifest.segments.a.length > 0 && manifest.segments.v.length > 0,
    `${manifest.segments.a.length} audio, ${manifest.segments.v.length} video`);

  check("archive completeness reaches 100%",
    manifest.completeness.overallRatio >= 0.99,
    `${(manifest.completeness.overallRatio * 100).toFixed(1)}%`);

  check("recorder codec is recorded for the player", Boolean(manifest.mimeType.v), manifest.mimeType.v ?? "");

  // ---- playback ---------------------------------------------------------
  const play = await context.newPage();
  const playErrors = [];
  play.on("pageerror", (e) => playErrors.push(e.message));
  play.on("console", (m) => {
    if (m.type() === "error") playErrors.push(`console: ${m.text()}`);
  });
  await play.goto(`${BASE}/player.html?id=e2etest&t=${encodeURIComponent(token)}`);

  try {
    await play.waitForFunction(() => window.__elongo?.appended?.size > 0, { timeout: 20000 });
    check("player fetches and appends segments", true);
  } catch {
    const diag = await play.evaluate(() => ({
      hasState: Boolean(window.__elongo),
      appended: window.__elongo ? window.__elongo.appended.size : -1,
      hasMs: Boolean(window.__elongo?.mediaSource),
      hasSb: Boolean(window.__elongo?.sourceBuffer),
      msState: window.__elongo?.mediaSource?.readyState ?? "none",
      err: document.getElementById("error")?.textContent ?? "",
      status: document.getElementById("statusText")?.textContent ?? "",
    }));
    check("player fetches and appends segments", false, JSON.stringify(diag));
    console.log("  player errors:", playErrors.join(" | ") || "(none)");
  }

  await play.click("#playPause");
  await play.waitForFunction(
    () => {
      const v = document.getElementById("video");
      return v && v.currentTime > 0.4 && !v.paused;
    },
    { timeout: 20000 },
  );
  const played = await play.evaluate(() => {
    const v = document.getElementById("video");
    return { currentTime: v.currentTime, buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0 };
  });
  check("real media actually plays", played.currentTime > 0.4,
    `t=${played.currentTime.toFixed(1)}s of ${played.buffered.toFixed(1)}s buffered`);

  const archiveNote = await play.textContent("#archiveNote");
  check("player reports the archive to the family", /complet|arrivé|reçu/i.test(archiveNote ?? ""),
    (archiveNote ?? "").slice(0, 60));

  // ---- token enforcement in a real browser ------------------------------
  const bad = await context.newPage();
  await bad.goto(`${BASE}/player.html?id=e2etest&t=forged.token.1.2`);
  await bad.waitForTimeout(1500);
  const badText = await bad.textContent("#error");
  check("a forged token is refused in the browser too", /n'est plus valable|existe pas/i.test(badText ?? ""));

  check("no uncaught errors in the capture client", capErrors.length === 0, capErrors.join("; "));
  check("no uncaught errors in the player", playErrors.length === 0, playErrors.join("; "));
} catch (err) {
  check("suite completed", false, err.message);
} finally {
  await browser?.close();
  cleanup();
}

console.log("\n  \x1b[2m" + "─".repeat(66) + "\x1b[0m");
if (failures === 0) {
  console.log(`  \x1b[32m\x1b[1mAll ${results.length} end-to-end checks passed.\x1b[0m\n`);
} else {
  console.log(`  \x1b[31m\x1b[1m${failures} of ${results.length} failed.\x1b[0m\n`);
  process.exit(1);
}
