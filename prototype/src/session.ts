import { LadderController } from "./encoder/controller.ts";
import { BUFFERED_RUNG, FLOOR_RUNG, LADDER, segmentBytes } from "./encoder/ladder.ts";
import { LinkSimulator } from "./link/simulator.ts";
import type { LinkProfile } from "./link/profiles.ts";
import { PowerBudget } from "./power/budget.ts";
import { SegmentStore } from "./pipeline/store.ts";
import { Uploader } from "./pipeline/uploader.ts";
import type { SessionConfig, TickRecord } from "./types.ts";

export type SessionResult = {
  readonly config: SessionConfig;
  readonly profile: LinkProfile;
  readonly ticks: readonly TickRecord[];
  readonly store: SegmentStore;
  readonly batteryEndPct: number;
  /** Rung index -> seconds spent there. */
  readonly rungSeconds: readonly number[];
  /** Seconds during which the link delivered nothing at all. */
  readonly outageSeconds: number;
  /** False if the battery ran out before the booked end time. */
  readonly reachedEnd: boolean;
  readonly capturedSeconds: number;
  readonly peakQueueDepthSec: number;
  readonly screenOffSeconds: number;
};

/**
 * Runs one Presence end to end: capture, adapt, budget power, upload, then
 * drain whatever backlog remains.
 *
 * The drain phase models the hours after the event — the correspondent gets
 * home, plugs in, and finds coverage. Battery is not charged against the drain
 * for that reason; it is explicitly not part of what this simulation claims.
 */
export function runSession(config: SessionConfig, profile: LinkProfile): SessionResult {
  const link = new LinkSimulator(profile, config.durationSec, config.seed);
  const store = new SegmentStore();
  const uploader = new Uploader(store, config.liveWindowSec);
  const controller = new LadderController(config.liveWindowSec);
  const power = new PowerBudget(
    config.batteryCapacityWh,
    config.batteryStartPct,
    config.powerBankWh ?? 0,
  );

  const ticks: TickRecord[] = [];
  const rungSeconds = new Array<number>(LADDER.length).fill(0);
  let outageSeconds = 0;
  let deliveredKbpsLast = 0;
  let queueLimitedLast = true;
  let peakQueueDepthSec = 0;
  let screenOffSeconds = 0;
  let capturedSeconds = 0;
  let reachedEnd = true;

  for (let t = 0; t < config.durationSec; t++) {
    if (power.empty) {
      reachedEnd = false;
      break;
    }

    const sample = link.sample(t);
    const queueDepthSec = store.liveQueueDepthSec(t, config.liveWindowSec);
    peakQueueDepthSec = Math.max(peakQueueDepthSec, queueDepthSec);

    const powerCap = power.capRungIndex(config.durationSec - t, sample.signal);
    const rung = controller.update(
      deliveredKbpsLast,
      queueLimitedLast,
      queueDepthSec,
      sample.loss,
      powerCap,
    );
    rungSeconds[rung.index] += 1;
    if (!power.state.screenOn) screenOffSeconds += 1;

    // Capture always happens, at every rung including "buffered". The camera
    // does not care whether the network exists; that is the entire point.
    const effective = rung.index === BUFFERED_RUNG ? LADDER[FLOOR_RUNG] : rung;
    store.append("audio", t, segmentBytes(effective, "audio", t));
    store.append(
      "video",
      t,
      segmentBytes(effective, "video", t),
      effective.stillIntervalSec ?? 1,
    );
    capturedSeconds += 1;

    const drained = uploader.drain(sample.kbps, sample.loss, t);
    deliveredKbpsLast = (drained.bytes * 8) / 1000;
    queueLimitedLast = drained.queueLimited;
    if (sample.kbps <= 0) outageSeconds += 1;

    power.tick(rung, sample.signal);

    ticks.push({
      t,
      rung: rung.index,
      linkKbps: Math.round(sample.kbps),
      deliveredKbps: Math.round(deliveredKbpsLast),
      queueDepthSec: Math.round(queueDepthSec),
      batteryPct: Math.round(power.percent * 10) / 10,
      audioLive: queueDepthSec <= config.liveWindowSec && sample.kbps > 0,
      videoLive: rung.hasVideo && queueDepthSec <= config.liveWindowSec && sample.kbps > 0,
      estimateKbps: Math.round(controller.estimate),
      powerCap,
    });
  }

  // Backfill: drain the remaining queue after the event.
  for (let t = config.durationSec; t < config.durationSec + config.drainSec; t++) {
    if (store.pending().length === 0) break;
    const sample = link.sample(t);
    uploader.drain(sample.kbps, sample.loss, t);
  }

  return {
    config,
    profile,
    ticks,
    store,
    batteryEndPct: power.percent,
    rungSeconds,
    outageSeconds,
    reachedEnd,
    capturedSeconds,
    peakQueueDepthSec,
    screenOffSeconds,
  };
}
