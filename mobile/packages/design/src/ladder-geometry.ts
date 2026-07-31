/**
 * The signal ladder — geometry only.
 *
 * Every product needs a visual signature and ours is already sitting in the
 * architecture: the stepped bar showing quality falling and recovering across
 * an event. It appears in three places, drawn with Skia:
 *
 *   1. Correspondent, live — the current rung, so a correspondent sees the
 *      network degrading without reading text.
 *   2. Viewer, on the scrubber — the quality of each moment, with outages
 *      marked, so a relative can see there was one hole at 1:05 and that it is
 *      the only one.
 *   3. The recording's cover — the whole event's ladder as its thumbnail. Every
 *      recording gets a shape unique to the afternoon it was filmed.
 *
 * This file computes shapes and nothing else: no Skia import, no React. That is
 * so the part that can be wrong — bucketing, the worst-case rule, the treatment
 * of stretches with no data — is testable in milliseconds.
 *
 * THE RULE THAT MATTERS. When a bucket spans several rungs it takes the *worst*
 * of them, never the mean. This graphic's whole job is to let somebody find the
 * moment it broke; averaging a thirty-second outage into a five-minute bucket
 * hides exactly the thing they came to see. The web player shipped painting the
 * current status across the entire recording, and the founder's verdict was
 * that "a high graded system can not work like this. It must report the issue
 * exactly at the very moment it occurred."
 */

import { rungColour } from "./tokens.ts";

export const BUFFERED_RUNG_INDEX = 7;
export const RUNG_COUNT = 8;

/** One measurement: the rung in force for `coversSec` starting at `atSec`. */
export type LadderSample = {
  readonly atSec: number;
  readonly coversSec: number;
  readonly rung: number;
};

export type LadderBar = {
  /** Left edge, px. */
  readonly x: number;
  readonly width: number;
  /** Top edge, px — bars are anchored to the baseline. */
  readonly y: number;
  readonly height: number;
  readonly colour: string;
  /** The worst rung in this bucket, or null where nothing was recorded. */
  readonly rung: number | null;
  readonly fromSec: number;
  readonly toSec: number;
};

export type LadderGeometry = {
  readonly bars: readonly LadderBar[];
  /** Contiguous stretches at the buffered rung — the gap markers. */
  readonly outages: readonly { readonly x: number; readonly width: number; readonly fromSec: number; readonly toSec: number }[];
  readonly durationSec: number;
};

export type LadderOptions = {
  readonly width: number;
  readonly height: number;
  /** Total timeline length. Falls back to the span the samples cover. */
  readonly durationSec?: number;
  /** Target bar width in px, including the gap. Bars are never sub-pixel. */
  readonly barPitch?: number;
  /** Gap between bars, px. */
  readonly barGap?: number;
  /** Shortest bar, px — a total outage must still be visible, not invisible. */
  readonly minBarHeight?: number;
};

const DEFAULTS = { barPitch: 6, barGap: 2, minBarHeight: 3 };

/**
 * Bar height for a rung.
 *
 * Linear from full height at rung 0 down to `minBarHeight` at the buffered
 * rung. The buffered rung is not zero-height on purpose: an outage that renders
 * as nothing is indistinguishable from a stretch that was never filmed, and
 * those two mean opposite things to somebody who paid for the recording.
 */
export function barHeight(rung: number, height: number, minBarHeight = DEFAULTS.minBarHeight): number {
  const clamped = Math.max(0, Math.min(RUNG_COUNT - 1, rung));
  const t = 1 - clamped / (RUNG_COUNT - 1);
  return Math.max(minBarHeight, minBarHeight + t * (height - minBarHeight));
}

export function colourForRung(rung: number | null): string {
  if (rung === null) return "#24394A"; // ink700 — no data, deliberately inert
  return rungColour[Math.max(0, Math.min(rungColour.length - 1, rung))];
}

function spanOf(samples: readonly LadderSample[]): number {
  let end = 0;
  for (const s of samples) end = Math.max(end, s.atSec + Math.max(0, s.coversSec));
  return end;
}

export function ladderGeometry(
  samples: readonly LadderSample[],
  options: LadderOptions,
): LadderGeometry {
  const barPitch = options.barPitch ?? DEFAULTS.barPitch;
  const barGap = options.barGap ?? DEFAULTS.barGap;
  const minBarHeight = options.minBarHeight ?? DEFAULTS.minBarHeight;
  const width = Math.max(0, options.width);
  const height = Math.max(minBarHeight, options.height);
  const durationSec = Math.max(0, options.durationSec ?? spanOf(samples));

  if (width <= 0 || durationSec <= 0) {
    return { bars: [], outages: [], durationSec };
  }

  const count = Math.max(1, Math.floor(width / barPitch));
  const pitch = width / count;
  const barWidth = Math.max(1, pitch - barGap);
  const bucketSec = durationSec / count;

  // Worst rung per bucket. `null` means no sample touched it.
  const worst: (number | null)[] = new Array(count).fill(null);
  for (const s of samples) {
    const from = Math.max(0, s.atSec);
    const to = Math.min(durationSec, s.atSec + Math.max(0, s.coversSec));
    if (to <= from) {
      // Zero-length sample: still colour the bucket it lands in, otherwise a
      // one-off telemetry ping vanishes.
      const i = Math.min(count - 1, Math.floor(from / bucketSec));
      if (i >= 0 && from <= durationSec) {
        worst[i] = worst[i] === null ? s.rung : Math.max(worst[i] as number, s.rung);
      }
      continue;
    }
    const first = Math.max(0, Math.floor(from / bucketSec));
    const last = Math.min(count - 1, Math.ceil(to / bucketSec) - 1);
    for (let i = first; i <= last; i += 1) {
      worst[i] = worst[i] === null ? s.rung : Math.max(worst[i] as number, s.rung);
    }
  }

  const bars: LadderBar[] = worst.map((rung, i) => {
    const h = rung === null ? minBarHeight : barHeight(rung, height, minBarHeight);
    return {
      x: i * pitch,
      width: barWidth,
      y: height - h,
      height: h,
      colour: colourForRung(rung),
      rung,
      fromSec: i * bucketSec,
      toSec: (i + 1) * bucketSec,
    };
  });

  // Merge adjacent buffered buckets into one marker: three separate ticks read
  // as three outages, which is a different and more alarming fact than one.
  const outages: LadderGeometry["outages"][number][] = [];
  let run: { start: number; end: number } | null = null;
  for (let i = 0; i < count; i += 1) {
    const out = worst[i] !== null && (worst[i] as number) >= BUFFERED_RUNG_INDEX;
    if (out && run === null) run = { start: i, end: i };
    else if (out && run) run.end = i;
    else if (!out && run) {
      outages.push(marker(run, pitch, bucketSec));
      run = null;
    }
  }
  if (run) outages.push(marker(run, pitch, bucketSec));

  return { bars, outages, durationSec };
}

function marker(run: { start: number; end: number }, pitch: number, bucketSec: number) {
  return {
    x: run.start * pitch,
    width: (run.end - run.start + 1) * pitch,
    fromSec: run.start * bucketSec,
    toSec: (run.end + 1) * bucketSec,
  };
}

/**
 * The rung in force at a given moment.
 *
 * Drives the status line as the viewer scrubs. Returns null before the first
 * sample rather than guessing — "we do not know" is a legitimate answer and it
 * is better than confidently showing the wrong one.
 */
export function rungAtSec(samples: readonly LadderSample[], atSec: number): number | null {
  let best: LadderSample | null = null;
  for (const s of samples) {
    if (s.atSec > atSec) continue;
    if (s.atSec + Math.max(s.coversSec, 0) < atSec) {
      // Ended before this moment; still the most recent knowledge if nothing
      // newer exists.
      if (!best || s.atSec > best.atSec) best = s;
      continue;
    }
    if (!best || s.atSec >= best.atSec) best = s;
  }
  return best ? best.rung : null;
}
