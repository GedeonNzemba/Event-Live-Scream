/**
 * Money, as integer minor units (cents). Never floating point.
 *
 * This is not pedantry. The pool's whole job is splitting one price across
 * several people and reassembling it exactly, and `89 / 9` in binary floating
 * point is 9.888888888888889 — nine of which sum to 89.00000000000001. A
 * customer who is charged a cent more than the others notices, and a pool that
 * reports itself 1 cent short of its target never closes.
 */

/** Amount in minor units. Positive integers only, in this domain. */
export type Money = number;

export const ZERO: Money = 0;

export function eur(major: number): Money {
  return Math.round(major * 100);
}

export function toMajor(m: Money): number {
  return m / 100;
}

export function add(...xs: Money[]): Money {
  return xs.reduce((a, b) => a + b, 0);
}

export function sub(a: Money, b: Money): Money {
  return a - b;
}

/** Percentage in basis points (100 bps = 1%), rounded half-up to the cent. */
export function bps(m: Money, basisPoints: number): Money {
  return Math.round((m * basisPoints) / 10_000);
}

export function min(a: Money, b: Money): Money {
  return a < b ? a : b;
}

export function max(a: Money, b: Money): Money {
  return a > b ? a : b;
}

export function fmt(m: Money, symbol = "€"): string {
  const neg = m < 0;
  const v = Math.abs(m);
  const major = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const s = `${symbol}${major}.${String(v % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/**
 * Splits an amount into `n` shares that sum **exactly** to the original.
 *
 * The remainder cents go to the earliest shares, so €89 across nine people is
 * eight shares of €9.89 and one of €9.88 — and the suggested-contribution
 * figure shown in the UI is the larger one, so a pool that everybody funds at
 * the suggested amount always closes fully rather than one cent short.
 */
export function splitEvenly(total: Money, n: number): Money[] {
  if (n <= 0) throw new RangeError("cannot split across fewer than one share");
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** What each person should be asked for, so `n` equal payments always cover `total`. */
export function suggestedShare(total: Money, n: number): Money {
  return Math.ceil(total / n);
}
