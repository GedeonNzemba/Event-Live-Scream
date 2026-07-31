import { runBaseline } from "./baseline.ts";
import { PROFILES, getProfile } from "./link/profiles.ts";
import { printSessionReport, printSummaryRow, summaryHeader } from "./report.ts";
import { runSession } from "./session.ts";
import type { SessionConfig } from "./types.ts";

/**
 * Simulates a Presence and compares it against a conventional video call on the
 * identical link.
 *
 *   node src/cli.ts                       the wedding worst case
 *   node src/cli.ts pointe-noire-3g       a specific profile
 *   node src/cli.ts --all                 every profile, summarised
 *   node src/cli.ts --list
 *
 * Options: --hours=N --battery=N --seed=N
 */

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags.set(k, v ?? "true");
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));

if (flags.has("list")) {
  console.log("\n  Available link profiles:\n");
  for (const p of Object.values(PROFILES)) {
    console.log(`    ${p.id.padEnd(22)} ${p.label}`);
    console.log(`    ${" ".repeat(22)} ${p.description.split("\n")[0]}\n`);
  }
  process.exit(0);
}

const hours = Number(flags.get("hours") ?? 3);
const battery = Number(flags.get("battery") ?? 55);
const seed = Number(flags.get("seed") ?? 20260731);

function configFor(name: string, durationSec: number): SessionConfig {
  return {
    name,
    durationSec,
    // Backfill has the rest of the evening; the correspondent gets home to a
    // charger and to coverage. Six hours is not generous, it is realistic.
    drainSec: 6 * 3600,
    batteryStartPct: battery,
    // ~4,000 mAh at 3.85 V, a typical mid-range Android.
    batteryCapacityWh: 15.4,
    // Watch mode spends latency to buy resilience. Fifteen seconds is
    // imperceptible when you are watching a wedding and nobody is expecting you
    // to answer.
    liveWindowSec: 15,
    seed,
  };
}

if (flags.has("all")) {
  console.log("");
  console.log("  Elongo presence engine — all profiles");
  console.log(
    `  ${hours}h event, battery starting at ${battery}%, seed ${seed}\n`,
  );
  summaryHeader();
  for (const profile of Object.values(PROFILES)) {
    const config = configFor(profile.id, Math.round(hours * 3600));
    const result = runSession(config, profile);
    const baseline = runBaseline(config, profile);
    printSummaryRow(profile.label, result, baseline);
  }
  console.log("");
  console.log("  heard / saw   share of the event received live, as audio and as moving picture");
  console.log("  archive       share that reached the family's permanent recording");
  console.log("");
  console.log("  On a good link a normal call is fine, and the honest reading of row one is");
  console.log("  that we add little live. The difference appears where the customer actually");
  console.log("  lives — congested cells, rural coverage, a blackout during the speeches — and");
  console.log("  in the archive column, which is 0% for a real-time call in every condition,");
  console.log("  because it does not make one.\n");
  process.exit(0);
}

const profileId = positional[0] ?? "wedding-worst-case";
let profile;
try {
  profile = getProfile(profileId);
} catch {
  console.error(`\n  Unknown link profile "${profileId}".\n`);
  console.error("  Available:");
  for (const p of Object.values(PROFILES)) console.error(`    ${p.id.padEnd(22)} ${p.label}`);
  console.error("\n  Run with --list for descriptions.\n");
  process.exit(1);
}

if (!Number.isFinite(hours) || hours <= 0) {
  console.error("\n  --hours must be a positive number.\n");
  process.exit(1);
}
if (!Number.isFinite(battery) || battery <= 0 || battery > 100) {
  console.error("\n  --battery must be between 1 and 100.\n");
  process.exit(1);
}

const config = configFor(profileId, Math.round(hours * 3600));

const result = runSession(config, profile);
const baseline = runBaseline(config, profile);
printSessionReport(result, baseline);
console.log("");
