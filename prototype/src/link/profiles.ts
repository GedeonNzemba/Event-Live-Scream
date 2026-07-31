/**
 * Uplink profiles approximating conditions in Congo-Brazzaville.
 *
 * These are engineering approximations, not measurements. They are shaped by the
 * published aggregates cited in docs/01-problem.md — 66.8% of connections at 3G
 * or better, heavy concentration of capacity in Brazzaville and Pointe-Noire —
 * and by the two effects that dominate an event stream in practice:
 *
 *   1. Uplink is far scarcer than downlink. Mobile networks are engineered for
 *      subscribers pulling data down, not for one handset pushing video up.
 *   2. A gathering congests its own cell. Two hundred wedding guests on the same
 *      tower, all posting photographs, is the reason the stream degrades at
 *      exactly the moment it matters most.
 *
 * Replace these with real measurements from Brazzaville as soon as any exist.
 * The engine is what is being tested here; the profiles are the test fixture.
 */

export type ScheduledOutage = {
  readonly startSec: number;
  readonly durationSec: number;
  readonly reason: string;
};

export type LinkProfile = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Median usable uplink, kbps. */
  readonly baseKbps: number;
  /** Amplitude of slow drift, kbps. */
  readonly driftKbps: number;
  /** Fast per-second jitter as a fraction of current bandwidth. */
  readonly jitter: number;
  readonly baseLoss: number;
  readonly rttMs: number;
  /** Nominal radio signal quality, 0..1. Drives transmit power draw. */
  readonly signal: number;
  /** Expected number of brief unscheduled dropouts per hour. */
  readonly microOutagesPerHour: number;
  readonly outages: readonly ScheduledOutage[];
  /**
   * Optional congestion multiplier applied to bandwidth, as a function of
   * progress through the event (0..1). Models a cell filling up with guests.
   */
  readonly congestion?: (progress: number) => number;
};

export const PROFILES: Record<string, LinkProfile> = {
  "brazzaville-4g": {
    id: "brazzaville-4g",
    label: "Brazzaville, 4G, daytime",
    description: "Good urban conditions. The best case this business will see.",
    baseKbps: 1400,
    driftKbps: 400,
    jitter: 0.15,
    baseLoss: 0.005,
    rttMs: 90,
    signal: 0.8,
    microOutagesPerHour: 1,
    outages: [],
  },

  "brazzaville-evening": {
    id: "brazzaville-evening",
    label: "Brazzaville, 4G, evening peak",
    description: "Congested urban cell. The common case for an evening party.",
    baseKbps: 600,
    driftKbps: 300,
    jitter: 0.3,
    baseLoss: 0.03,
    rttMs: 180,
    signal: 0.6,
    microOutagesPerHour: 6,
    outages: [],
  },

  "pointe-noire-3g": {
    id: "pointe-noire-3g",
    label: "Pointe-Noire, 3G",
    description: "Secondary city on 3G. Video is possible but never comfortable.",
    baseKbps: 320,
    driftKbps: 180,
    jitter: 0.35,
    baseLoss: 0.05,
    rttMs: 280,
    signal: 0.5,
    microOutagesPerHour: 12,
    outages: [],
  },

  "rural-edge": {
    id: "rural-edge",
    label: "Rural Congo, EDGE",
    description:
      "A village in the Cuvette or the Pool. No video call survives this. " +
      "The audio floor and store-and-forward are the entire product here.",
    baseKbps: 90,
    driftKbps: 60,
    jitter: 0.5,
    baseLoss: 0.1,
    rttMs: 600,
    signal: 0.3,
    microOutagesPerHour: 30,
    outages: [
      { startSec: 900, durationSec: 240, reason: "cell unreachable" },
      { startSec: 3600, durationSec: 480, reason: "cell unreachable" },
    ],
  },

  "wedding-worst-case": {
    id: "wedding-worst-case",
    label: "Wedding day, worst case",
    description:
      "The scenario the company exists for. Good signal as the ceremony opens, " +
      "the cell degrades as two hundred guests arrive and start posting, then a " +
      "twenty-minute total blackout across the speeches — a tower on generator " +
      "during a grid cut. Recovers, partially, for the dancing.",
    baseKbps: 1200,
    driftKbps: 350,
    jitter: 0.25,
    baseLoss: 0.02,
    rttMs: 140,
    signal: 0.65,
    microOutagesPerHour: 8,
    outages: [{ startSec: 5400, durationSec: 1200, reason: "grid cut at the cell site" }],
    congestion: (progress) => {
      // Guests arrive and saturate the cell through the first half, then thin
      // out. Bottoms at ~22% of nominal capacity around the midpoint.
      const peak = 0.55;
      const depth = 0.78;
      const width = 0.32;
      const d = (progress - peak) / width;
      return 1 - depth * Math.exp(-d * d);
    },
  },
};

export function getProfile(id: string): LinkProfile {
  const p = PROFILES[id];
  if (!p) {
    throw new Error(
      `Unknown link profile "${id}". Available: ${Object.keys(PROFILES).join(", ")}`,
    );
  }
  return p;
}
