import { BUFFERED_RUNG, FLOOR_RUNG, LADDER, rung, type Rung } from "./ladder.ts";

/**
 * Adaptive rung selection.
 *
 * This is a direct port of the controller in `prototype/`, and it carries four
 * lessons that were each a bug first. They are restated here because a
 * reimplementation on a new platform is exactly where hard-won rules get
 * quietly dropped — which is what happened to the browser client.
 *
 *   1. THE LATENCY BUDGET IS THE RESILIENCE BUDGET. Watch mode runs seconds
 *      behind on purpose, and a shallow send queue is healthy. Thresholds are
 *      fractions of the live window, never absolute seconds.
 *
 *   2. ONLY THE LIVE EDGE COUNTS AS CONGESTION. Measuring backlog across all
 *      pending content — which is old by definition after an outage — pins the
 *      ladder at the buffered rung for the rest of the event. The browser
 *      client shipped with this bug and a founder found it in ten minutes.
 *
 *   3. THROUGHPUT IS ONLY A MEASUREMENT WHEN THE LINK WAS THE LIMIT. At the
 *      audio floor the client offers 24 kbps and will measure 24 kbps forever.
 *      Queue-limited samples are a lower bound; probe upward instead.
 *
 *   4. AN OUTAGE IS NOT A BANDWIDTH SAMPLE. Decaying the estimate through a
 *      dropout leaves the client crawling back from zero for minutes.
 */

const QUEUE_ALARM_FRACTION = 0.45;
const QUEUE_PANIC_FRACTION = 0.75;
const CLIMB_STABLE_TICKS = 4;
const CHANGE_COOLDOWN_TICKS = 3;
const HEADROOM = 1.2;
const PROBE_GROWTH = 1.06;
const WARMUP_TICKS = 3;
const DOWNSHIFT_MIN_GAP_TICKS = 2;

export type ControllerInput = {
  /** What actually got through since the last tick, kbps. */
  readonly deliveredKbps: number;
  /** True when the queue emptied with capacity to spare. */
  readonly queueLimited: boolean;
  /** Age of the oldest unsent segment *within the live window*, seconds. */
  readonly liveBacklogSec: number;
  /** Lowest-quality rung the power budget permits. */
  readonly powerCapIndex: number;
};

export class LadderController {
  private current = 1;
  private stable = 0;
  private sinceChange = 99;
  private estimateKbps = LADDER[1].totalKbps;
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

  get estimate(): number {
    return this.estimateKbps;
  }

  /** Best rung the current estimate supports, ignoring power. */
  private supported(): number {
    for (const r of LADDER) {
      if (this.estimateKbps >= r.totalKbps * HEADROOM) return r.index;
    }
    return BUFFERED_RUNG;
  }

  update(input: ControllerInput): Rung {
    const { deliveredKbps, queueLimited, liveBacklogSec, powerCapIndex } = input;
    this.ticks += 1;
    this.sinceChange += 1;

    if (deliveredKbps <= 0 && !queueLimited) {
      // Lesson 4: the link is down, not slow. Freeze rather than decay.
      this.estimateKbps = Math.max(this.estimateKbps, LADDER[FLOOR_RUNG].totalKbps);
    } else if (queueLimited) {
      // Lesson 3: a lower bound, so probe upward.
      this.estimateKbps =
        Math.max(this.estimateKbps, deliveredKbps, LADDER[FLOOR_RUNG].totalKbps) * PROBE_GROWTH;
      this.estimateKbps = Math.min(this.estimateKbps, LADDER[0].totalKbps * 2);
    } else {
      this.estimateKbps = 0.7 * this.estimateKbps + 0.3 * deliveredKbps;
    }

    if (this.ticks <= WARMUP_TICKS) {
      // The power ceiling is arithmetic, not a measurement: valid from tick one.
      this.current = Math.max(this.current, powerCapIndex);
      return this.rung;
    }

    const before = this.current;

    if (liveBacklogSec >= this.panicSec) {
      if (this.sinceChange >= DOWNSHIFT_MIN_GAP_TICKS) {
        const severity = liveBacklogSec >= this.panicSec * 1.5 ? 2 : 1;
        this.current = Math.min(BUFFERED_RUNG, this.current + severity);
        this.sinceChange = 0;
      }
      this.stable = 0;
    } else if (liveBacklogSec >= this.alarmSec) {
      this.stable = 0;
    } else {
      const target = Math.max(this.supported(), powerCapIndex);
      if (target < this.current) {
        this.stable += 1;
        if (this.stable >= CLIMB_STABLE_TICKS && this.sinceChange >= CHANGE_COOLDOWN_TICKS) {
          // Jump to the supported rung; stepping takes minutes after a blackout.
          this.current = target;
          this.stable = 0;
        }
      } else {
        this.stable = 0;
      }
    }

    const supported = this.supported();
    if (supported > this.current) {
      this.current = supported;
      this.stable = 0;
    }

    if (this.current < powerCapIndex) {
      this.current = powerCapIndex;
      this.stable = 0;
    }

    if (this.current !== before) this.sinceChange = 0;
    return this.rung;
  }
}
