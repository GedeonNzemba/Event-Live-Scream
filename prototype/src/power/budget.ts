import { BUFFERED_RUNG, LADDER } from "../encoder/ladder.ts";
import type { PowerState, Rung } from "../types.ts";

/**
 * Power-aware capture.
 *
 * A video call knows the battery level. It does not know that the ceremony runs
 * until six o'clock, so it cannot plan, and it spends the battery at whatever
 * rate the network happens to permit. That is how a phone reaches 0% during the
 * speeches.
 *
 * Elongo knows the booked end time, so it can solve the other problem: what is
 * the best quality that still reaches the end of the event? Reaching the end at
 * 360p beats two hours of 720p followed by silence, always.
 *
 * The term that is easy to miss — and that matters most in rural Congo — is that
 * transmit power rises sharply as signal quality falls. A handset on a weak cell
 * burns several times the energy to move the same bytes. Weak signal is
 * therefore doubly punishing: less throughput and faster drain, exactly the
 * conditions where a naive client fights hardest and dies soonest.
 */

const BASE_W = 0.55; // SoC, OS, sensors
const CAMERA_W = 0.7; // sensor + ISP while capturing
const SCREEN_W = 1.1; // display + backlight; usually the largest single draw
const RADIO_IDLE_W = 0.25;
const TX_W_PER_MBPS = 0.5; // at perfect signal
const MIN_SIGNAL = 0.15;

function encodeWatts(r: Rung): number {
  if (!r.hasVideo) return 0.05;
  if (r.stillIntervalSec !== null) return 0.06;
  // Roughly proportional to pixels x frame rate, normalised to 720p30 = 0.9 W.
  const pixels = r.height * (r.height * 16) / 9;
  const reference = 720 * ((720 * 16) / 9);
  return 0.9 * (pixels / reference) * (r.fps / 30);
}

function cameraWatts(r: Rung): number {
  if (!r.hasVideo) return 0.1;
  // In stills mode the sensor is duty-cycled between shots rather than held in
  // continuous preview, which is most of the saving. Modelling it at the full
  // continuous-capture cost made the photo-call rung draw *more* than the
  // better 180p12 rung above it — a ladder that is not monotonic in power is a
  // ladder the budget manager will make bad choices with.
  if (r.stillIntervalSec !== null) return 0.3;
  return CAMERA_W;
}

function txWatts(kbps: number, signal: number): number {
  return (kbps / 1000) * (TX_W_PER_MBPS / Math.max(MIN_SIGNAL, signal));
}

/** Total instantaneous draw, watts. */
export function drawWatts(r: Rung, signal: number, screenOn: boolean): number {
  return (
    BASE_W +
    cameraWatts(r) +
    encodeWatts(r) +
    (screenOn ? SCREEN_W : 0) +
    RADIO_IDLE_W +
    txWatts(r.totalKbps, signal)
  );
}

export class PowerBudget {
  readonly state: PowerState;

  constructor(capacityWh: number, startPct: number, powerBankWh = 0) {
    this.state = {
      capacityWh,
      // The power bank is energy available to the session, not extra capacity
      // in the handset, so it is added to the starting charge rather than to
      // the denominator. Reported percentage can therefore exceed 100 while the
      // bank is still feeding the phone, which is exactly what a correspondent
      // sees on a topped-up device.
      wh: (capacityWh * startPct) / 100 + powerBankWh,
      screenOn: true,
    };
  }

  get percent(): number {
    return (this.state.wh / this.state.capacityWh) * 100;
  }

  get empty(): boolean {
    return this.state.wh <= 0;
  }

  /** Drain one second at the given operating point. */
  tick(r: Rung, signal: number): void {
    const w = drawWatts(r, signal, this.state.screenOn);
    this.state.wh = Math.max(0, this.state.wh - w / 3600);
  }

  /**
   * The best rung that still reaches the end of the booked event, expressed as
   * a lower bound on the rung index the controller may select.
   *
   * Measures are applied in increasing order of how much the customer notices
   * them: kill the preview screen first (the correspondent is watching the
   * event, not the phone), and only then start giving up picture quality.
   */
  capRungIndex(secondsRemaining: number, signal: number): number {
    if (secondsRemaining <= 0) return 0;
    const budgetW = (this.state.wh * 3600) / secondsRemaining;

    const best = (screenOn: boolean): number => {
      for (const r of LADDER) {
        if (drawWatts(r, signal, screenOn) <= budgetW) return r.index;
      }
      // Even the floor will not reach the end. Sit on the floor anyway: a
      // partial event delivered beats an empty promise of quality, and
      // store-and-forward means everything captured still arrives.
      return BUFFERED_RUNG - 1;
    };

    const withScreen = best(true);
    const withoutScreen = best(false);

    // Sacrifice the preview screen before sacrificing picture quality. The
    // correspondent is watching the wedding, not the handset, so this costs
    // them almost nothing — and the display is usually the largest single draw.
    if (withoutScreen < withScreen) {
      this.state.screenOn = false;
      return withoutScreen;
    }

    // Nothing fits, not even the floor. Both branches returned the same
    // fallback rung, so the comparison above could not distinguish them — but
    // this is precisely the emergency where the screen must go, and an earlier
    // version left it on and drained 1.1 W it could not afford.
    if (drawWatts(LADDER[withScreen], signal, true) > budgetW) {
      this.state.screenOn = false;
      return withoutScreen;
    }

    this.state.screenOn = true;
    return withScreen;
  }
}
