import { BUFFERED_RUNG, FLOOR_RUNG, LADDER, rung } from "./ladder.ts";
import type { Rung } from "../types.ts";

/**
 * Adaptive rung selection.
 *
 * Three ideas do the work here, and each one is a mistake we made first.
 *
 * 1. THE LATENCY BUDGET IS THE RESILIENCE BUDGET. Watch mode deliberately runs
 *    15 seconds behind, and that buffer is not slack to be protected — it is
 *    the thing we bought the latency for. A send queue four seconds deep is
 *    perfectly healthy when the deadline is fifteen seconds out; degrading the
 *    picture at that point throws away the entire advantage of not being a
 *    video call. Thresholds are therefore expressed as fractions of the live
 *    window, never as absolute seconds.
 *
 * 2. THROUGHPUT IS ONLY A MEASUREMENT WHEN THE LINK WAS THE LIMIT. Once the
 *    ladder drops to audio-only the client offers 24 kbps and will measure
 *    24 kbps forever, no matter how much capacity returns. So queue-limited
 *    seconds are treated as a lower bound and probed upward instead.
 *
 * 3. AN OUTAGE IS NOT A BANDWIDTH SAMPLE. Decaying the estimate through a
 *    dropout leaves the client crawling back from zero for minutes afterwards.
 *    Freeze it instead and let the queue correct us if the link really did get
 *    worse.
 *
 * Beyond that the controller is asymmetric on purpose: fall fast, climb slowly.
 * A premature fall costs a slightly softer picture nobody notices. A premature
 * climb costs a visible stall, which reads to the customer as "it cut out
 * again" — the exact failure this company exists to eliminate.
 */

const QUEUE_ALARM_FRACTION = 0.45; // of the live window: stop climbing
const QUEUE_PANIC_FRACTION = 0.75; // of the live window: start shedding
const CLIMB_STABLE_SEC = 12; // sustained headroom required before climbing
const CHANGE_COOLDOWN_SEC = 10; // hysteresis, so the picture does not oscillate
const HEADROOM = 1.2; // must beat a rung's target by this factor to select it
const PROBE_GROWTH = 1.06; // per-second optimism while queue-limited
const WARMUP_SEC = 3; // do not act on an unmeasured link
const DOWNSHIFT_MIN_GAP_SEC = 2; // never shed more than one step every 2 s

export class LadderController {
  private current = 1;
  private stableSec = 0;
  private sinceChange = 99;
  private estimateKbps = LADDER[1].totalKbps;
  private lossEwma = 0;
  private ticks = 0;
  private readonly alarmSec: number;
  private readonly panicSec: number;

  constructor(liveWindowSec: number) {
    this.alarmSec = Math.max(1, liveWindowSec * QUEUE_ALARM_FRACTION);
    this.panicSec = Math.max(2, liveWindowSec * QUEUE_PANIC_FRACTION);
  }

  get rungIndex(): number {
    return this.current;
  }

  get rung(): Rung {
    return rung(this.current);
  }

  /** Observed packet loss, smoothed. Telemetry only — never a control input. */
  get observedLoss(): number {
    return this.lossEwma;
  }

  /** Current belief about available uplink capacity, kbps. */
  get estimate(): number {
    return this.estimateKbps;
  }

  /** Best rung the current estimate will support, ignoring power. */
  private supportedRung(): number {
    for (const r of LADDER) {
      if (this.estimateKbps >= r.totalKbps * HEADROOM) return r.index;
    }
    return BUFFERED_RUNG;
  }

  /**
   * @param deliveredKbps  what actually got through in the last second
   * @param queueLimited   true if the queue emptied with capacity to spare
   * @param queueDepthSec  age of the oldest unsent live segment, seconds
   * @param loss           observed packet loss, 0..1
   * @param powerCapIndex  lowest-quality rung the power budget will permit
   */
  update(
    deliveredKbps: number,
    queueLimited: boolean,
    queueDepthSec: number,
    loss: number,
    powerCapIndex: number,
  ): Rung {
    this.ticks += 1;
    this.sinceChange += 1;

    if (deliveredKbps <= 0 && !queueLimited) {
      this.estimateKbps = Math.max(this.estimateKbps, LADDER[FLOOR_RUNG].totalKbps);
    } else if (queueLimited) {
      this.estimateKbps =
        Math.max(this.estimateKbps, deliveredKbps, LADDER[FLOOR_RUNG].totalKbps) * PROBE_GROWTH;
      this.estimateKbps = Math.min(this.estimateKbps, LADDER[0].totalKbps * 2);
    } else {
      this.estimateKbps = 0.7 * this.estimateKbps + 0.3 * deliveredKbps;
    }

    // Loss is tracked for telemetry and deliberately NOT used to select a rung.
    //
    // On a wireless link most loss is radio error, not congestion: the rural
    // EDGE profile sits at 10-15% loss while comfortably carrying its nominal
    // bitrate. An earlier version treated loss above a threshold as congestion
    // and pinned the ladder to the floor for entire events on exactly the links
    // where the product matters most. Loss is already paid for in goodput — the
    // uploader charges retransmissions against capacity — so counting it again
    // here is double-counting a cost we have already absorbed.
    //
    // Queue depth is the honest congestion signal: a backlog is direct evidence
    // we are offering more than the link will take, whatever the cause.
    this.lossEwma = 0.8 * this.lossEwma + 0.2 * loss;

    if (this.ticks <= WARMUP_SEC) {
      // Still measuring the link, but the power ceiling is not a measurement —
      // it is arithmetic, valid from the first second. Applying it only after
      // warmup let a nearly flat phone open at 480p and burn charge it could
      // not spare.
      this.current = Math.max(this.current, powerCapIndex);
      return this.rung;
    }

    const before = this.current;
    const panicking = queueDepthSec >= this.panicSec;

    if (panicking) {
      if (this.sinceChange >= DOWNSHIFT_MIN_GAP_SEC) {
        // Shed harder the closer the queue is to missing the live deadline.
        const severity = queueDepthSec >= this.panicSec * 1.5 ? 2 : 1;
        this.current = Math.min(BUFFERED_RUNG, this.current + severity);
        this.sinceChange = 0;
      }
      this.stableSec = 0;
    } else if (queueDepthSec >= this.alarmSec) {
      // Buffer is being consumed but the deadline is not in danger. Hold.
      this.stableSec = 0;
    } else {
      const target = Math.max(this.supportedRung(), powerCapIndex);
      if (target < this.current) {
        this.stableSec += 1;
        if (this.stableSec >= CLIMB_STABLE_SEC && this.sinceChange >= CHANGE_COOLDOWN_SEC) {
          // Climb straight to the rung the link supports rather than one step
          // at a time: after a dropout, stepping back up would take minutes.
          this.current = target;
          this.stableSec = 0;
        }
      } else {
        this.stableSec = 0;
      }
    }

    // A rung the link plainly cannot carry is not a rung to sit on, even before
    // the queue has backed up enough to panic.
    const supported = this.supportedRung();
    if (supported > this.current) {
      this.current = supported;
      this.stableSec = 0;
    }

    // The power budget is a hard ceiling on quality, never a suggestion.
    if (this.current < powerCapIndex) {
      this.current = powerCapIndex;
      this.stableSec = 0;
    }

    if (this.current !== before) this.sinceChange = 0;
    return this.rung;
  }
}
