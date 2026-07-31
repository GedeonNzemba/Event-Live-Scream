import { LadderController } from "./controller.ts";
import { BUFFERED_RUNG, rung as rungAt, type Rung } from "./ladder.ts";
import { advise, type PowerState } from "./power.ts";
import {
  liveBacklogSec,
  missing,
  pendingBytes,
  sendOrder,
  type PendingSegment,
  type Track,
} from "./segments.ts";
import { statusLine, type StatusLine } from "./status.ts";

/**
 * The capture engine.
 *
 * Everything the correspondent app does during a ceremony, expressed without
 * React Native, expo-sqlite, VisionCamera or a network — all of which arrive as
 * injected ports. That is the whole point: the loop that has to survive a
 * three-hour funeral on a dying battery in Makélékélé can be run three hundred
 * times a second on a laptop instead of discovered in the field.
 *
 * The engine owns four decisions and nothing else:
 *
 *   1. WHAT QUALITY TO ENCODE — the ladder controller, bounded by the power
 *      budget. On native this is a real encoder setting, not merely an upload
 *      policy, which is the reason the native app is worth building at all.
 *   2. WHAT TO SEND NEXT — strict priority: live audio, live video, backfill
 *      audio, backfill video.
 *   3. WHEN TO RECONCILE — after the link returns, ask the server what actually
 *      arrived and re-send only the difference.
 *   4. WHAT TO TELL THE HUMAN — the honest status line, in French.
 *
 * It does not own: the camera, the filesystem, the database, HTTP, or the
 * clock. Those are the ports below.
 */

export type Clock = () => number; // seconds since capture start

export type EngineStore = {
  /** Everything captured but not yet acknowledged by the server. */
  pending(): readonly PendingSegment[];
  /** Called once the server has the bytes. Frees the file. */
  acknowledge(track: Track, seq: number): void;
};

export type EngineTransport = {
  /** Resolves on success, rejects on any failure. Retries live inside. */
  send(segment: PendingSegment): Promise<void>;
  /** Reconciliation: what the server actually holds. */
  status(): Promise<{ received: Readonly<Record<Track, readonly number[]>> }>;
  /** Heartbeat carrying the status line to everyone watching. */
  progress(update: ProgressUpdate): Promise<void>;
};

/**
 * What the heartbeat carries.
 *
 * Every field here ends up in front of a person: the family reads the label,
 * and the ops dashboard reads the numbers to decide whether to telephone the
 * correspondent. Passing the whole thing rather than reassembling it in the
 * transport is not tidiness — a transport that has to invent `batteryPct`
 * invents `null`, and the one number that tells you a ceremony is about to go
 * dark silently stops being reported.
 */
export type ProgressUpdate = {
  readonly capturedThroughSec: number;
  readonly rung: Rung;
  readonly status: StatusLine;
  readonly batteryPct: number | null;
  readonly uplinkKbps: number;
  readonly backlogSec: number;
  readonly screenOn: boolean;
};

export type EngineOptions = {
  /** How far behind live watch mode deliberately runs. */
  readonly liveWindowSec: number;
  /** Seconds of continuous send failure before declaring the link down. */
  readonly offlineAfterSec?: number;
  /** Seconds after the link returns before reconciling once. */
  readonly reconcileAfterRecoverySec?: number;
  /**
   * Reconcile at least this often while anything is pending.
   *
   * Not merely a belt-and-braces timer: the *ambiguous* failure — the server
   * stored the bytes, the acknowledgement never came back — leaves a segment
   * that fails every retry forever while the link is otherwise healthy. There
   * is no recovery edge to hang reconciliation off, so it has to be periodic.
   */
  readonly reconcileEverySec?: number;
};

export type EngineTick = {
  readonly rung: Rung;
  readonly status: StatusLine;
  readonly screenOn: boolean;
  readonly pendingBytes: number;
  readonly liveBacklogSec: number;
  readonly estimateKbps: number;
  readonly online: boolean;
  /** Segments handed to the transport this tick, in send order. */
  readonly sent: readonly PendingSegment[];
};

const DEFAULT_OFFLINE_AFTER_SEC = 6;
const DEFAULT_RECONCILE_AFTER_SEC = 3;
const DEFAULT_RECONCILE_EVERY_SEC = 30;

export class CaptureEngine {
  private readonly controller: LadderController;
  private readonly store: EngineStore;
  private readonly transport: EngineTransport;
  private readonly clock: Clock;
  private readonly liveWindowSec: number;
  private readonly offlineAfterSec: number;
  private readonly reconcileAfterSec: number;
  private readonly reconcileEverySec: number;

  private bytesThisTick = 0;
  private lastTickAt = 0;
  private failingSinceSec: number | null = null;
  private nextReconcileAt: number;
  private reconciling = false;
  private screenOn = true;
  private inFlight = new Set<string>();

  constructor(args: {
    store: EngineStore;
    transport: EngineTransport;
    clock: Clock;
    options: EngineOptions;
  }) {
    this.store = args.store;
    this.transport = args.transport;
    this.clock = args.clock;
    this.liveWindowSec = args.options.liveWindowSec;
    this.offlineAfterSec = args.options.offlineAfterSec ?? DEFAULT_OFFLINE_AFTER_SEC;
    this.reconcileAfterSec = args.options.reconcileAfterRecoverySec ?? DEFAULT_RECONCILE_AFTER_SEC;
    this.reconcileEverySec = args.options.reconcileEverySec ?? DEFAULT_RECONCILE_EVERY_SEC;
    this.nextReconcileAt = this.reconcileEverySec;
    this.controller = new LadderController(this.liveWindowSec);
  }

  get rung(): Rung {
    return this.controller.rung;
  }

  /**
   * One tick. Call once a second.
   *
   * Returns what the app should render and what it handed to the transport.
   * Sending is fire-and-forget on purpose: a tick that awaited its uploads
   * would stop adapting the moment the network got slow, which is precisely
   * when adapting matters.
   */
  async tick(power: PowerState, capacityKbps?: number): Promise<EngineTick> {
    const now = this.clock();
    const elapsed = Math.max(0.001, now - this.lastTickAt);
    this.lastTickAt = now;

    const pending = this.store.pending();
    const backlog = liveBacklogSec(pending, now, this.liveWindowSec);

    // Delivered since the last tick. `capacityKbps` is only for simulation; in
    // the app it is measured from acknowledged bytes.
    const deliveredKbps = capacityKbps ?? (this.bytesThisTick * 8) / 1000 / elapsed;
    this.bytesThisTick = 0;

    const budget = advise(power);
    this.screenOn = budget.screenOn;

    const online = this.failingSinceSec === null || now - this.failingSinceSec < this.offlineAfterSec;

    // QUEUE-LIMITED MEANS "NOTHING WAS WAITING", NOT "NOTHING EXISTS".
    //
    // The obvious test — is the pending list empty? — is almost never true
    // during a live capture, because a segment was just written to disk this
    // second. Using it means the controller never sees a queue-limited sample,
    // never probes upward, and settles forever at whatever the current rung
    // happens to offer: a 900 kbps link measured as 184 kbps because 184 kbps
    // is all that was asked of it. What actually matters is whether anything
    // was still in flight when the tick came round.
    const queueLimited = online && this.inFlight.size === 0;

    const rung = this.controller.update({
      deliveredKbps,
      queueLimited,
      liveBacklogSec: online ? backlog : this.liveWindowSec * 2,
      powerCapIndex: budget.capIndex,
    });

    const effective = online ? rung : rungAt(BUFFERED_RUNG);

    const status = statusLine(
      {
        rung: effective.index,
        batteryPct: power.batteryLevel * 100,
        uplinkKbps: this.controller.estimate,
        backlogSec: backlog,
        screenOn: this.screenOn,
      },
      "live",
    );

    // Reconcile a few seconds after the link comes back, and periodically after
    // that while anything is still pending. Immediately on recovery is wrong:
    // the first successful request after an outage is often followed by three
    // more failures, and a status call in that window is a wasted round trip on
    // a link that has better things to carry.
    //
    // Only *stale* content is worth asking about. A pending list containing
    // nothing but the segment written this second has nothing to reconcile, and
    // asking anyway turns a quiet client into one that calls /status every
    // thirty seconds for the whole ceremony.
    const hasStale = pending.some((s) => now - s.capturedAt > this.liveWindowSec);
    if (online && hasStale && !this.reconciling && now >= this.nextReconcileAt) {
      this.nextReconcileAt = now + this.reconcileEverySec;
      void this.reconcile();
    }

    // WHILE OFFLINE, PROBE — DO NOT FLOOD, AND DO NOT STOP.
    //
    // Stopping deadlocks: the only way to learn the link came back is to try
    // sending. Flooding is the other failure — firing the whole backlog at a
    // dead radio every second burns power for nothing, and the correspondent's
    // battery is the constraint this company exists to work around. One
    // segment per tick, in priority order, is enough to detect recovery.
    const queue = sendOrder(pending, now, this.liveWindowSec, effective);
    const toSend = online ? queue : queue.slice(0, 1);

    const sent: PendingSegment[] = [];
    for (const segment of toSend) {
      const id = `${segment.track}:${segment.seq}`;
      if (this.inFlight.has(id)) continue;
      this.inFlight.add(id);
      sent.push(segment);
      void this.deliver(segment, id);
    }

    void this.transport
      .progress({
        capturedThroughSec: now,
        rung: effective,
        status,
        batteryPct: power.batteryLevel * 100,
        uplinkKbps: this.controller.estimate,
        backlogSec: backlog,
        screenOn: this.screenOn,
      })
      .catch(() => {
        // A missed heartbeat is cosmetic. Losing the ceremony is not. Never let
        // telemetry failure take down the capture.
      });

    return {
      rung: effective,
      status,
      screenOn: this.screenOn,
      pendingBytes: pendingBytes(pending),
      liveBacklogSec: backlog,
      estimateKbps: this.controller.estimate,
      online,
      sent,
    };
  }

  private async deliver(segment: PendingSegment, id: string): Promise<void> {
    try {
      await this.transport.send(segment);
      this.store.acknowledge(segment.track, segment.seq);
      this.bytesThisTick += segment.bytes;
      if (this.failingSinceSec !== null) {
        // The link just came back. Bring the reconciliation forward: the server
        // may hold segments whose acknowledgements died with the connection.
        this.failingSinceSec = null;
        this.nextReconcileAt = Math.min(this.nextReconcileAt, this.clock() + this.reconcileAfterSec);
      }
    } catch {
      // The bytes are still on disk. This is a delay, not a loss — which is the
      // entire difference between this product and a video call.
      if (this.failingSinceSec === null) this.failingSinceSec = this.clock();
    } finally {
      this.inFlight.delete(id);
    }
  }

  /**
   * Ask the server what it actually holds, and forget anything it already has.
   *
   * The ambiguous failure is the common one on this link: the request went out,
   * the acknowledgement never came back. Without this the client re-uploads
   * content the server already has, on a data bundle somebody paid cash for.
   */
  private async reconcile(): Promise<void> {
    this.reconciling = true;
    try {
      const { received } = await this.transport.status();
      const stillMissing = new Set(
        missing(this.store.pending(), received).map((s) => `${s.track}:${s.seq}`),
      );
      for (const segment of [...this.store.pending()]) {
        const id = `${segment.track}:${segment.seq}`;
        if (!stillMissing.has(id)) this.store.acknowledge(segment.track, segment.seq);
      }
    } catch {
      // Reconciliation is an optimisation: failing it costs bandwidth, never
      // content. Try again shortly rather than waiting a full period, since the
      // usual reason it failed is that the link is still coming back.
      this.nextReconcileAt = this.clock() + this.reconcileAfterSec;
    } finally {
      this.reconciling = false;
    }
  }
}
