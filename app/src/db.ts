import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FamilyPool, type PoolSnapshot } from "../../pool/src/pool.ts";

/**
 * Storage.
 *
 * A JSON file, written atomically. Postgres is the right answer for the real
 * thing and this is not the real thing — it exists so a founder can click
 * through the actual flow without provisioning a database first, and so test
 * pools survive a restart.
 *
 * The domain model stays pure: this module only stores and reconstructs
 * snapshots. Every business rule lives in ../../pool/src/pool.ts, where it is
 * already tested.
 */

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ELONGO_DATA_DIR ?? join(here, "..", ".data");
const DATA_FILE = join(DATA_DIR, "presences.json");

export type Presence = {
  readonly reference: string;
  readonly eventName: string;
  readonly tierId: string;
  readonly whenISO: string;
  readonly place: string;
  readonly bookerName: string;
  readonly bookerCountry: string;
  readonly createdAtISO: string;
  /** Set once the pool closes and a correspondent is assigned. */
  correspondent?: string;
  pool: PoolSnapshot;
};

type Database = { presences: Record<string, Presence> };

let cache: Database | null = null;

function load(): Database {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Database;
  } catch {
    cache = { presences: {} };
  }
  return cache;
}

function persist(): void {
  const db = load();
  mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temporary file and rename, so a crash mid-write cannot leave a
  // half-written file that loses every booking.
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DATA_FILE);
}

export function allPresences(): Presence[] {
  return Object.values(load().presences).sort((a, b) =>
    b.createdAtISO.localeCompare(a.createdAtISO),
  );
}

export function getPresence(reference: string): Presence | undefined {
  return load().presences[reference];
}

export function savePresence(p: Presence): void {
  load().presences[p.reference] = p;
  persist();
}

/** Reconstructs the domain object for a stored presence. */
export function poolFor(p: Presence): FamilyPool {
  return FamilyPool.fromSnapshot(p.pool);
}

/** Applies a change to the pool and stores the result. */
export function updatePool(p: Presence, mutate: (pool: FamilyPool) => void): Presence {
  const pool = poolFor(p);
  mutate(pool);
  const updated: Presence = { ...p, pool: pool.toSnapshot() };
  savePresence(updated);
  return updated;
}

export function resetAll(): void {
  cache = { presences: {} };
  persist();
}

/**
 * Short, unambiguous references that survive being read aloud over a bad phone
 * line to Brazzaville — no vowels (so no accidental words), and none of the
 * characters people confuse: 0/O, 1/I/L, 5/S, 8/B.
 */
const ALPHABET = "23479CFHJKMNPQRTVWXY";

export function newReference(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return getPresence(out) ? newReference() : out;
}
