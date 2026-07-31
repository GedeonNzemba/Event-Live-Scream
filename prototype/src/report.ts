import type { BaselineResult } from "./baseline.ts";
import { LADDER } from "./encoder/ladder.ts";
import type { SessionResult } from "./session.ts";

const useColour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ESC = "\x1b";
const c = (code: string, s: string): string =>
  useColour ? `${ESC}[${code}m${s}${ESC}[0m` : s;
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);
const green = (s: string) => c("32", s);
const yellow = (s: string) => c("33", s);
const red = (s: string) => c("31", s);
const cyan = (s: string) => c("36", s);

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function grade(x: number): string {
  const s = pct(x);
  if (x >= 0.98) return green(s);
  if (x >= 0.85) return yellow(s);
  return red(s);
}

function hhmmss(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}h${String(m).padStart(2, "0")}m`
    : `${m}m${String(s).padStart(2, "0")}s`;
}

/** Compresses the whole event into one line of blocks: taller means better quality. */
function ladderSparkline(result: SessionResult, width = 72): string {
  const blocks = "▁▂▃▄▅▆▇█";
  const n = result.ticks.length;
  if (n === 0) return "";
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const from = Math.floor((i * n) / width);
    const to = Math.max(from + 1, Math.floor(((i + 1) * n) / width));
    let worst = 0;
    for (let j = from; j < to && j < n; j++) worst = Math.max(worst, result.ticks[j].rung);
    // Rung 0 is best; invert so a tall block reads as good quality.
    const level = Math.max(0, Math.min(7, 7 - Math.round((worst / 6) * 7)));
    const ch = blocks[level];
    out.push(worst >= 6 ? red(ch) : worst >= 5 ? yellow(ch) : worst >= 3 ? cyan(ch) : green(ch));
  }
  return out.join("");
}

export function printSessionReport(result: SessionResult, baseline: BaselineResult): void {
  const { store, config, profile } = result;
  const liveW = config.liveWindowSec;

  const audioContinuity = store.livePresence("audio", liveW, config.durationSec);
  const videoContinuity = store.livePresence("video", liveW, config.durationSec);
  const completeness = store.completeness();
  const audioCompleteness = store.completeness("audio");

  const line = "─".repeat(78);
  console.log("");
  console.log(bold(`  ${profile.label}`));
  console.log(dim(`  ${profile.description}`));
  console.log(dim(`  ${line}`));

  console.log(
    `  ${dim("event")} ${hhmmss(config.durationSec)}` +
      `   ${dim("battery")} ${config.batteryStartPct}% → ${result.batteryEndPct.toFixed(0)}%` +
      `   ${dim("outage")} ${hhmmss(result.outageSeconds)}` +
      `   ${dim("captured")} ${hhmmss(result.capturedSeconds)}`,
  );
  console.log("");

  console.log(`  ${dim("quality over time")}  ${ladderSparkline(result)}`);
  console.log(
    `  ${dim(" ".repeat(18))}  ${dim("start")}${" ".repeat(58)}${dim("end")}`,
  );
  console.log("");

  console.log(bold("  ELONGO"));
  console.log(`    heard live                 ${grade(audioContinuity)}   ${dim("share of the event heard as it happened")}`);
  console.log(`    saw live                   ${grade(videoContinuity)}   ${dim("share with a fresh picture")}`);
  console.log(`    recording completeness     ${grade(completeness)}   ${dim("the archive the family keeps")}`);
  console.log(`    …audio track               ${grade(audioCompleteness)}`);
  console.log(
    `    reached the booked end     ${result.reachedEnd ? green("yes") : red("no — battery died")}`,
  );
  console.log("");

  console.log(bold("  CONVENTIONAL VIDEO CALL") + dim("  (same link, same seed)"));
  const bAny = baseline.deliveredSeconds / baseline.totalSeconds;
  const bVideo = baseline.videoSeconds / baseline.totalSeconds;
  console.log(`    anything received at all   ${grade(bAny)}   ${dim("audio or video")}`);
  console.log(`    moving video received      ${grade(bVideo)}`);
  console.log(
    `    recording completeness     ${red("0.0%")}   ${dim("there is no recording")}`,
  );
  console.log(
    `    call drops                 ${baseline.drops > 0 ? red(String(baseline.drops)) : green("0")}` +
      `   ${dim(`${hhmmss(baseline.secondsLostToReconnect)} lost waiting to be called back`)}`,
  );
  console.log("");

  const rungRows = LADDER.map((r, i) => ({ r, sec: result.rungSeconds[i] })).filter(
    (x) => x.sec > 0,
  );
  console.log(bold("  TIME AT EACH RUNG"));
  for (const { r, sec } of rungRows) {
    const share = sec / result.capturedSeconds;
    const bar = "█".repeat(Math.max(1, Math.round(share * 40)));
    const label = `${r.index} ${r.name}`.padEnd(14);
    console.log(`    ${label} ${dim(bar)} ${hhmmss(sec)} ${dim(`(${pct(share)})`)}`);
  }
  if (result.screenOffSeconds > 0) {
    console.log(
      dim(`    preview screen disabled for ${hhmmss(result.screenOffSeconds)} to protect the power budget`),
    );
  }
  console.log("");

  const deltaLive = audioContinuity - bAny;
  console.log(bold("  VERDICT"));
  console.log(
    `    Elongo delivered ${bold(grade(completeness))} of the event to the family's archive, ` +
      `and\n    kept them listening for ${bold(grade(audioContinuity))} of it in real time.`,
  );
  console.log(
    `    A conventional call would have delivered ${bold(grade(bAny))} live and\n` +
      `    ${bold(red("nothing"))} afterwards.`,
  );
  if (deltaLive > 0.01) {
    console.log(
      dim(`    Live presence improved by ${(deltaLive * 100).toFixed(1)} percentage points; the archive by 100.`),
    );
  }
  console.log(dim(`  ${line}`));
}

/** Pads to a visible width, ignoring any ANSI escapes the colouring added. */
function padVisible(coloured: string, plain: string, width: number): string {
  return " ".repeat(Math.max(0, width - plain.length)) + coloured;
}

export function summaryHeader(): void {
  console.log(
    `  ${"".padEnd(30)}${"── Elongo ──".padStart(26)}${"── a normal call ──".padStart(28)}`,
  );
  console.log(
    `  ${"profile".padEnd(30)}${"heard".padStart(9)}${"saw".padStart(9)}${"archive".padStart(9)}` +
      `${"heard".padStart(12)}${"saw".padStart(9)}${"archive".padStart(9)}`,
  );
  console.log(`  ${"─".repeat(86)}`);
}

export function printSummaryRow(name: string, result: SessionResult, baseline: BaselineResult): void {
  const { liveWindowSec, durationSec } = result.config;
  const heard = result.store.livePresence("audio", liveWindowSec, durationSec);
  const saw = result.store.livePresence("video", liveWindowSec, durationSec);
  const complete = result.store.completeness();
  const bHeard = baseline.audioSeconds / baseline.totalSeconds;
  const bSaw = baseline.videoSeconds / baseline.totalSeconds;
  console.log(
    `  ${name.padEnd(30)}` +
      padVisible(grade(heard), pct(heard), 9) +
      padVisible(grade(saw), pct(saw), 9) +
      padVisible(grade(complete), pct(complete), 9) +
      padVisible(grade(bHeard), pct(bHeard), 12) +
      padVisible(grade(bSaw), pct(bSaw), 9) +
      padVisible(red("0.0%"), "0.0%", 9),
  );
}
