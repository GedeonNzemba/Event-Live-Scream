import type { Rung } from "../types.ts";

/**
 * The degradation ladder from docs/06-technical-architecture.md.
 *
 * Two rungs carry the design:
 *
 *   Rung 4 ("photo call") occupies the gap most systems leave empty, between
 *   bad video and outright failure. Continuous sound plus a face every three
 *   seconds, at a bitrate that carries where video cannot.
 *
 *   Rung 5 is the floor. 24 kbps of Opus gets through conditions no video call
 *   survives, and audio is the emotional payload: a family that can hear the
 *   wedding is at the wedding.
 *
 * Rung 6 is not a quality level. It means the network is gone and we are
 * recording to local storage for later delivery — which is why nothing is ever
 * actually lost.
 */
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

/**
 * The 180p12 rung exists because this simulation said it had to. The first
 * ladder stepped straight from 250 kbps to a stills-only mode, and on
 * Pointe-Noire 3G that 2x gap dropped live video for hours at a stretch on a
 * link that could comfortably have carried a small picture. Ladder steps want
 * to be roughly 1.6-1.9x; anything wider is a hole customers fall into.
 */
export const FLOOR_RUNG = LADDER.length - 2; // audio only
export const BUFFERED_RUNG = LADDER.length - 1; // recording locally, delivering later

export function rung(index: number): Rung {
  return LADDER[Math.max(0, Math.min(LADDER.length - 1, index))];
}

/**
 * Bytes the encoder emits for one track in one second at a given rung.
 *
 * Audio is constant-rate. Video at rung 4 emits a still only on the interval,
 * so most seconds produce nothing at all — that is what makes 120 kbps enough
 * for a continuous sense of presence.
 */
export function segmentBytes(r: Rung, track: "audio" | "video", second: number): number {
  if (track === "audio") return Math.round((r.audioKbps * 1000) / 8);
  if (!r.hasVideo) return 0;
  if (r.stillIntervalSec !== null) {
    if (second % r.stillIntervalSec !== 0) return 0;
    return Math.round((r.videoKbps * 1000 * r.stillIntervalSec) / 8);
  }
  return Math.round((r.videoKbps * 1000) / 8);
}
