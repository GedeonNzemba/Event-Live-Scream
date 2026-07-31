/**
 * French formatting.
 *
 * Both apps are French-first, and these are the four things they show most:
 * durations, money, data volumes and time remaining. They live here rather than
 * inline because getting them subtly wrong — a decimal point where a comma
 * belongs, "1.5 GB" to somebody whose bundle is sold in mégaoctets — is the
 * kind of detail that makes software feel foreign.
 *
 * Money is passed in minor units (centimes) and never as a float, matching
 * `pool/src/money.ts`.
 */

/**
 * French puts a non-breaking space before a unit or symbol.
 *
 * Written as an escape rather than as a literal character: a literal U+00A0 is
 * invisible in a diff and indistinguishable from a plain space in an editor,
 * which is exactly how a test ends up asserting one while the code produces the
 * other. Exported so the tests assert against the same constant.
 */
export const NBSP = "\u00A0";

/** 0:07, 4:31, 1:22:09 — timecodes, so no leading zero on the first field. */
export function timecode(totalSec: number): string {
  const t = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** "3 h 20", "45 min", "30 s" — prose, for battery and event length. */
export function humanDuration(totalSec: number): string {
  const t = Math.max(0, Math.round(totalSec));
  if (t < 60) return `${t}${NBSP}s`;
  const minutes = Math.round(t / 60);
  if (minutes < 60) return `${minutes}${NBSP}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`;
}

/** Bundles in Congo are sold in mégaoctets, so that is the unit people think in. */
export function dataSize(bytes: number): string {
  const b = Math.max(0, bytes);
  if (b < 1000) return `${Math.round(b)}${NBSP}o`;
  if (b < 1000 * 1000) return `${(b / 1000).toFixed(0)}${NBSP}ko`;
  if (b < 1000 * 1000 * 1000) {
    const mb = b / (1000 * 1000);
    return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : mb.toFixed(0)}${NBSP}Mo`;
  }
  return `${(b / 1e9).toFixed(1).replace(".", ",")}${NBSP}Go`;
}

export function bitrate(kbps: number): string {
  const k = Math.max(0, kbps);
  if (k < 1000) return `${Math.round(k)}${NBSP}kb/s`;
  return `${(k / 1000).toFixed(1).replace(".", ",")}${NBSP}Mb/s`;
}

/**
 * Money, from minor units.
 *
 * XAF has no minor unit in practice — prices are whole francs — so it is shown
 * without decimals even though it is stored in the same integer form.
 */
export function money(minor: number, currency: "EUR" | "XAF" = "EUR"): string {
  if (currency === "XAF") {
    return `${groups(Math.round(minor / 100))}${NBSP}FCFA`;
  }
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${groups(whole)},${cents}${NBSP}€`;
}

function groups(n: number): string {
  const s = String(Math.abs(n));
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NBSP;
    out += s[i];
  }
  return (n < 0 ? "-" : "") + out;
}

/**
 * Completeness, as a percentage.
 *
 * "100 %" is a promise this product makes — everything arrived — so it is
 * reserved for exactly 1. Anything short of that floors to 99,9 % rather than
 * rounding up, because a family told the recording is complete and then finding
 * a hole in it is the single worst outcome the archive guarantee can produce.
 */
export function percent(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped >= 1) return `100${NBSP}%`;
  const pct = clamped * 100;
  // The guard is on the *rounded* value, not the raw one: 99.6 rounds to 100
  // just as surely as 99.97 does.
  if (pct >= 10) {
    const rounded = Math.round(pct);
    return rounded >= 100 ? `99,9${NBSP}%` : `${rounded}${NBSP}%`;
  }
  const text = pct === 0 ? "0" : pct.toFixed(1).replace(".", ",");
  return `${text}${NBSP}%`;
}
