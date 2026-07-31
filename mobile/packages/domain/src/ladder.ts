/**
 * The degradation ladder.
 *
 * Unlike the browser client, a native encoder can genuinely change bitrate
 * mid-recording — so on mobile these are *encode* targets rather than upload
 * policy, which is the whole reason the native app is worth building
 * (docs/12-mobile-apps.md).
 */

export type Rung = {
  readonly index: number;
  readonly name: string;
  /** Total target, kbps: video + audio. */
  readonly totalKbps: number;
  readonly videoKbps: number;
  readonly audioKbps: number;
  readonly height: number;
  readonly fps: number;
  /** Rung 5 sends a still every N seconds instead of continuous video. */
  readonly stillIntervalSec: number | null;
  readonly hasVideo: boolean;
};

export const LADDER: readonly Rung[] = [
  { index: 0, name: "720p30",     totalKbps: 1500, videoKbps: 1436, audioKbps: 64, height: 720, fps: 30, stillIntervalSec: null, hasVideo: true },
  { index: 1, name: "480p24",     totalKbps: 800,  videoKbps: 752,  audioKbps: 48, height: 480, fps: 24, stillIntervalSec: null, hasVideo: true },
  { index: 2, name: "360p20",     totalKbps: 450,  videoKbps: 418,  audioKbps: 32, height: 360, fps: 20, stillIntervalSec: null, hasVideo: true },
  { index: 3, name: "240p15",     totalKbps: 250,  videoKbps: 218,  audioKbps: 32, height: 240, fps: 15, stillIntervalSec: null, hasVideo: true },
  { index: 4, name: "180p12",     totalKbps: 150,  videoKbps: 122,  audioKbps: 28, height: 180, fps: 12, stillIntervalSec: null, hasVideo: true },
  { index: 5, name: "photo call", totalKbps: 80,   videoKbps: 52,   audioKbps: 28, height: 360, fps: 0,  stillIntervalSec: 4,    hasVideo: true },
  { index: 6, name: "audio only", totalKbps: 24,   videoKbps: 0,    audioKbps: 24, height: 0,   fps: 0,  stillIntervalSec: null, hasVideo: false },
  { index: 7, name: "buffered",   totalKbps: 24,   videoKbps: 0,    audioKbps: 24, height: 0,   fps: 0,  stillIntervalSec: null, hasVideo: false },
];

export const FLOOR_RUNG = LADDER.length - 2;
export const BUFFERED_RUNG = LADDER.length - 1;

export function rung(index: number): Rung {
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, index))];
}

/** French labels for the status line the correspondent and viewer both read. */
export const RUNG_LABEL_FR: readonly string[] = [
  "720p",
  "480p",
  "360p",
  "240p",
  "180p",
  "photos",
  "audio seul",
  "réseau coupé",
];
