import { eur } from "../../pool/src/money.ts";
import { FamilyPool } from "../../pool/src/pool.ts";
import { SCENARIOS } from "../../pool/src/scenarios.ts";
import { newReference, type Presence, resetAll, savePresence } from "./db.ts";

/**
 * Loads the three scenarios from ../../pool/src/scenarios.ts as real bookings,
 * so there is something to click through immediately.
 *
 *   npm run seed
 *
 * Replaces anything already stored.
 */

const TIER_FOR: Record<string, string> = {
  wedding: "ceremonie",
  matanga: "grand",
  birthday: "fete",
};

const PLACE_FOR: Record<string, string> = {
  wedding: "Makélékélé, Brazzaville",
  matanga: "Bacongo, Brazzaville",
  birthday: "Pointe-Noire",
};

resetAll();

const now = Date.now();
let created = 0;

for (const [index, scenario] of SCENARIOS.entries()) {
  const reference = newReference();
  const pool = new FamilyPool({ ...scenario.config, reference });

  // The birthday deliberately stays short of its target, so the shortfall rule
  // in docs/03 is visible the moment you press "Clôturer" in the ops view.
  for (const r of scenario.relatives) {
    pool.contribute(r.name, r.country, eur(r.amount), { firstTime: r.firstTime });
  }

  const presence: Presence = {
    reference,
    eventName: scenario.title,
    tierId: TIER_FOR[scenario.id] ?? "fete",
    // Spread them across the coming fortnight.
    whenISO: new Date(now + (index + 2) * 3 * 86_400_000).toISOString(),
    place: PLACE_FOR[scenario.id] ?? "Brazzaville",
    bookerName: scenario.config.bookerName,
    bookerCountry: scenario.config.bookerCountry,
    createdAtISO: new Date(now - index * 3_600_000).toISOString(),
    pool: pool.toSnapshot(),
  };

  savePresence(presence);
  created++;
  console.log(
    `  ${reference}  ${scenario.title.padEnd(34)} ${(pool.raised / 100).toFixed(2)} € / ` +
      `${(pool.config.target / 100).toFixed(2)} €  (${pool.payerCount} participants)`,
  );
}

console.log(`\n  ${created} bookings created. Start the server with: npm start\n`);
