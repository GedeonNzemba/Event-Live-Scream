import { BUFFERED_RUNG, LADDER, type Rung } from "./ladder.ts";

/**
 * Power budgeting.
 *
 * A video call knows the battery level. It does not know the ceremony runs
 * until six o'clock, so it cannot plan — which is how a phone reaches 0% during
 * the speeches. Knowing the booked end time turns that into arithmetic:
 * *what is the best quality that still reaches the end?*
 *
 * Reaching the end at 360p beats two hours of 720p followed by silence.
 *
 * The term that matters most in rural Congo, and that is easy to miss:
 * **transmit power rises sharply as signal quality falls.** A handset on a weak
 * cell burns several times the energy to move the same bytes, so weak signal is
 * doubly punishing — less throughput and faster drain, exactly where a naive
 * client fights hardest and dies soonest.
 */

const BASE_W = 0.55; // SoC, OS, sensors
const CAMERA_W = 0.7; // sensor and ISP during continuous capture
const SCREEN_W = 1.1; // display and backlight — usually the largest single draw
const RADIO_IDLE_W = 0.25;
const TX_W_PER_MBPS = 0.5; // at perfect signal
const MIN_SIGNAL = 0.15;

function encodeWatts(r: Rung): number {
  if (!r.hasVideo) return 0.05;
  if (r.stillIntervalSec !== null) return 0.06;
  const pixels = r.height * ((r.height * 16) / 9);
  const reference = 720 * ((720 * 16) / 9);
  return 0.9 * (pixels / reference) * (r.fps / 30);
}

function cameraWatts(r: Rung): number {
  if (!r.hasVideo) return 0.1;
  // Stills duty-cycle the sensor instead of holding continuous preview.
  if (r.stillIntervalSec !== null) return 0.3;
  return CAMERA_W;
}

export function drawWatts(r: Rung, signal: number, screenOn: boolean): number {
  const tx = (r.totalKbps / 1000) * (TX_W_PER_MBPS / Math.max(MIN_SIGNAL, signal));
  return BASE_W + cameraWatts(r) + encodeWatts(r) + (screenOn ? SCREEN_W : 0) + RADIO_IDLE_W + tx;
}

export type PowerAdvice = {
  /** Lowest-quality rung index the budget permits. */
  readonly capIndex: number;
  /** False when the preview must be turned off to reach the end. */
  readonly screenOn: boolean;
  /** Projected watts at the capped rung. */
  readonly projectedWatts: number;
  /** True when no rung reaches the end — the kit's power bank is the answer. */
  readonly infeasible: boolean;
};

export type PowerState = {
  /** 0–1, from expo-battery. */
  readonly batteryLevel: number;
  /** Usable capacity, watt-hours. ~15.4 for a typical 4000 mAh handset. */
  readonly capacityWh: number;
  readonly secondsRemaining: number;
  /** 0–1 radio signal quality. */
  readonly signal: number;
  /** Extra energy available from the correspondent's power bank, watt-hours. */
  readonly powerBankWh?: number;
};

export function advise(state: PowerState): PowerAdvice {
  const availableWh = state.capacityWh * state.batteryLevel + (state.powerBankWh ?? 0);
  if (state.secondsRemaining <= 0) {
    return { capIndex: 0, screenOn: true, projectedWatts: 0, infeasible: false };
  }

  const budgetW = (availableWh * 3600) / state.secondsRemaining;

  const best = (screenOn: boolean): number => {
    for (const r of LADDER) {
      if (drawWatts(r, state.signal, screenOn) <= budgetW) return r.index;
    }
    return BUFFERED_RUNG - 1;
  };

  const withScreen = best(true);
  const withoutScreen = best(false);

  // Sacrifice the preview before sacrificing picture quality: the correspondent
  // is watching the wedding, not the handset, and the screen is the largest
  // single draw.
  if (withoutScreen < withScreen) {
    return {
      capIndex: withoutScreen,
      screenOn: false,
      projectedWatts: drawWatts(LADDER[withoutScreen], state.signal, false),
      infeasible: false,
    };
  }

  // Nothing fits, not even the floor. Kill the screen anyway — this is the
  // emergency it exists for — and report that a power bank is needed.
  const floorDraw = drawWatts(LADDER[withScreen], state.signal, true);
  if (floorDraw > budgetW) {
    return {
      capIndex: withoutScreen,
      screenOn: false,
      projectedWatts: drawWatts(LADDER[withoutScreen], state.signal, false),
      infeasible: true,
    };
  }

  return {
    capIndex: withScreen,
    screenOn: true,
    projectedWatts: floorDraw,
    infeasible: false,
  };
}

/** Hours the current operating point will last. For the correspondent's UI. */
export function hoursRemaining(state: PowerState, r: Rung, screenOn: boolean): number {
  const availableWh = state.capacityWh * state.batteryLevel + (state.powerBankWh ?? 0);
  return availableWh / drawWatts(r, state.signal, screenOn);
}
