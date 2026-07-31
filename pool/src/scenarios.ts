import { eur } from "./money.ts";
import { FamilyPool, type PoolConfig } from "./pool.ts";

/**
 * Real-shaped events, used by the CLI and the tests.
 *
 * The three differ in the ways that matter operationally: how many relatives
 * are abroad, how far in advance it is known, and how much slack there is if
 * somebody does not pay.
 */

export type Relative = {
  readonly name: string;
  readonly country: string;
  readonly amount: number; // euros, major units, for readability
  readonly firstTime: boolean;
};

export type Scenario = {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly config: PoolConfig;
  readonly relatives: readonly Relative[];
  /** What one person alone would have paid — the list price of the tier. */
  readonly soloPrice: number;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "wedding",
    title: "Mariage de Grace & Thierry",
    note: "Three weeks' notice, nine relatives abroad. The base case in docs/00.",
    soloPrice: 89,
    config: {
      reference: "grace-thierry",
      eventName: "Mariage de Grace & Thierry",
      target: eur(89),
      bookerName: "Sylvain",
      bookerCountry: "FR",
      expectedParticipants: 9,
    },
    relatives: [
      { name: "Sylvain", country: "FR", amount: 15, firstTime: false },
      { name: "Bernadette", country: "BE", amount: 10, firstTime: true },
      { name: "Christian", country: "CA", amount: 10, firstTime: true },
      { name: "Prisca", country: "UK", amount: 10, firstTime: true },
      { name: "Gaëlle", country: "FR", amount: 10, firstTime: true },
      { name: "Armand", country: "FR", amount: 10, firstTime: false },
      { name: "Nadège", country: "US", amount: 10, firstTime: true },
      { name: "Clément", country: "FR", amount: 8, firstTime: true },
      { name: "Josiane", country: "ZA", amount: 7, firstTime: true },
    ],
  },
  {
    id: "matanga",
    title: "Matanga de Papa Émile",
    note:
      "Four days' notice, a large family, and the highest-emotion event we serve. " +
      "Contributions run well above the ask — nobody wants to be the relative who " +
      "gave least at a funeral, which is why the overfunding rule exists.",
    soloPrice: 250,
    config: {
      reference: "papa-emile",
      eventName: "Matanga de Papa Émile",
      target: eur(250),
      bookerName: "Thérèse",
      bookerCountry: "FR",
      expectedParticipants: 16,
    },
    relatives: [
      { name: "Thérèse", country: "FR", amount: 40, firstTime: false },
      { name: "Blaise", country: "FR", amount: 30, firstTime: true },
      { name: "Mireille", country: "BE", amount: 25, firstTime: true },
      { name: "Rodrigue", country: "US", amount: 25, firstTime: true },
      { name: "Espérance", country: "UK", amount: 20, firstTime: true },
      { name: "Fabrice", country: "CA", amount: 20, firstTime: true },
      { name: "Chantal", country: "FR", amount: 20, firstTime: true },
      { name: "Ghislain", country: "FR", amount: 15, firstTime: false },
      { name: "Solange", country: "BE", amount: 15, firstTime: true },
      { name: "Patrick", country: "ZA", amount: 15, firstTime: true },
      { name: "Viviane", country: "FR", amount: 12, firstTime: true },
      { name: "Serge", country: "DE", amount: 10, firstTime: true },
      { name: "Odette", country: "FR", amount: 10, firstTime: true },
      { name: "Landry", country: "UK", amount: 10, firstTime: true },
    ],
  },
  {
    id: "birthday",
    title: "Anniversaire de Mamie Joséphine",
    note:
      "The everyday case, and the one nobody currently serves. Two payers, small " +
      "ticket, booked on Thursday for Saturday. Watch what the fixed fee does here.",
    soloPrice: 39,
    config: {
      reference: "mamie-josephine",
      eventName: "Anniversaire de Mamie Joséphine",
      target: eur(39),
      bookerName: "Aline",
      bookerCountry: "FR",
      expectedParticipants: 3,
    },
    relatives: [
      { name: "Aline", country: "FR", amount: 15, firstTime: false },
      { name: "Doriane", country: "FR", amount: 13, firstTime: true },
    ],
  },
];

export function buildPool(s: Scenario): FamilyPool {
  const pool = new FamilyPool(s.config);
  for (const r of s.relatives) {
    pool.contribute(r.name, r.country, eur(r.amount), { firstTime: r.firstTime });
  }
  return pool;
}

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) {
    throw new Error(`Unknown scenario "${id}". Available: ${SCENARIOS.map((x) => x.id).join(", ")}`);
  }
  return s;
}
