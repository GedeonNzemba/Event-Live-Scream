import { LinkSimulator } from "./link/simulator.ts";
import type { LinkProfile } from "./link/profiles.ts";
import type { SessionConfig } from "./types.ts";

/**
 * A conventional real-time video call, for comparison.
 *
 * Modelled generously and on purpose — the point is not to caricature WhatsApp,
 * which is very good software, but to show what any purely real-time transport
 * cannot do regardless of quality:
 *
 *   - It adapts bitrate down to 150 kbps, and freezes video while keeping audio
 *     when it cannot manage more. (Generous: real calls often do worse.)
 *   - It has no durable local buffer. Anything not transmitted as it happens is
 *     gone. This is the decisive difference, not the codec.
 *   - After ~12 s of no throughput the call drops.
 *   - Recovery needs a human: somebody at a wedding must notice the call ended,
 *     find the phone, and call back. 45 s is charitable.
 *   - There is no recording. When it is over, the missing minutes never existed.
 *
 * Everything above is a property of the transport model, not of any particular
 * vendor. Elongo's advantage comes from refusing to be purely real-time for the
 * 95% of an event that does not need to be.
 */

const MIN_CALL_KBPS = 150;
const AUDIO_ONLY_KBPS = 40;
const DROP_AFTER_STARVED_SEC = 12;
const RECONNECT_DELAY_SEC = 45;

export type BaselineResult = {
  /** Seconds of the event the far end saw or heard anything at all. */
  readonly deliveredSeconds: number;
  /** Seconds with usable moving video. */
  readonly videoSeconds: number;
  /** Seconds with audio, including video-frozen periods. */
  readonly audioSeconds: number;
  readonly totalSeconds: number;
  readonly drops: number;
  readonly secondsLostToReconnect: number;
  /** Always zero: a real-time call leaves nothing behind. */
  readonly recordedSeconds: number;
};

export function runBaseline(config: SessionConfig, profile: LinkProfile): BaselineResult {
  const link = new LinkSimulator(profile, config.durationSec, config.seed);

  let deliveredSeconds = 0;
  let videoSeconds = 0;
  let audioSeconds = 0;
  let starvedRun = 0;
  let reconnectingFor = 0;
  let drops = 0;
  let secondsLostToReconnect = 0;

  for (let t = 0; t < config.durationSec; t++) {
    const sample = link.sample(t);
    const goodput = sample.kbps * (1 - sample.loss);

    if (reconnectingFor > 0) {
      reconnectingFor -= 1;
      secondsLostToReconnect += 1;
      continue;
    }

    if (goodput < AUDIO_ONLY_KBPS) {
      starvedRun += 1;
      if (starvedRun >= DROP_AFTER_STARVED_SEC) {
        drops += 1;
        reconnectingFor = RECONNECT_DELAY_SEC;
        starvedRun = 0;
      }
      continue;
    }

    starvedRun = 0;
    deliveredSeconds += 1;
    audioSeconds += 1;
    if (goodput >= MIN_CALL_KBPS) videoSeconds += 1;
  }

  return {
    deliveredSeconds,
    videoSeconds,
    audioSeconds,
    totalSeconds: config.durationSec,
    drops,
    secondsLostToReconnect,
    recordedSeconds: 0,
  };
}
