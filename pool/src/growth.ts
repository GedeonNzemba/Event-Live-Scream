import type { Money } from "./money.ts";

/**
 * What the pool is actually worth.
 *
 * docs/03 claims an LTV:CAC ratio around 9-17x and says openly that the number
 * should be treated with suspicion, because it rests almost entirely on the
 * pool delivering cheap acquisition. This file is where that claim gets
 * checked, and it turns out to hinge on one number: how many of the relatives
 * a pool exposes later book an event of their own.
 */

export type GrowthInputs = {
  /** Paying participants per presence, including the booker. */
  readonly poolSize: number;
  /** Of the non-booker participants, the share who have never used Elongo. */
  readonly newFraction: number;
  /** Of those newly exposed people, the share who later book their own event. */
  readonly activationRate: number;
  readonly paidCac: Money;
  readonly ltv: Money;
};

export type GrowthResult = {
  /** New bookers generated per booking. The viral coefficient. */
  readonly k: number;
  /** Total customers eventually traceable to one paid acquisition. */
  readonly amplification: number;
  readonly blendedCac: Money;
  readonly ltvCacRatio: number;
  readonly selfSustaining: boolean;
};

export function growth(i: GrowthInputs): GrowthResult {
  const exposed = Math.max(0, i.poolSize - 1) * i.newFraction;
  const k = exposed * i.activationRate;

  // Each paid customer brings k more, who bring k^2 more, and so on. The series
  // converges to 1/(1-k) below one and diverges at or above it.
  const selfSustaining = k >= 1;
  const amplification = selfSustaining ? Infinity : 1 / (1 - k);
  const blendedCac = selfSustaining ? 0 : Math.round(i.paidCac * (1 - k));
  const ltvCacRatio = blendedCac === 0 ? Infinity : i.ltv / blendedCac;

  return { k, amplification, blendedCac, ltvCacRatio, selfSustaining };
}

/**
 * Inverted: what viral coefficient does a target blended CAC require?
 *
 * More useful than the forward calculation, because it converts an investor
 * claim into a testable field measurement. "We need K = 0.6" means "we need
 * roughly six of every ten pools to produce one future booker", which is
 * something the concierge phase in docs/07 can actually observe.
 */
export function requiredK(paidCac: Money, targetBlendedCac: Money): number {
  if (paidCac <= 0) return 0;
  return Math.max(0, 1 - targetBlendedCac / paidCac);
}

/** Activation rate needed to hit a given K at a given pool size. */
export function requiredActivation(k: number, poolSize: number, newFraction: number): number {
  const exposed = Math.max(0, poolSize - 1) * newFraction;
  return exposed === 0 ? Infinity : k / exposed;
}
