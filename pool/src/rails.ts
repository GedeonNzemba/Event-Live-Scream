import { bps, eur, fmt, min, type Money } from "./money.ts";

/**
 * Payment rails and what they cost.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  VERIFY THESE BEFORE PRICING ANYTHING.                                  │
 * │                                                                          │
 * │  These are published list rates for a European Stripe account as of      │
 * │  2026 and they move. Get a live quote, and negotiate: processors         │
 * │  discount meaningfully above roughly €50k/month of volume.               │
 * │                                                                          │
 * │  The value of this file is the SHAPE of the problem — a fixed fee per    │
 * │  transaction punishes splitting a bill, and that has to be designed      │
 * │  around — not these particular basis points.                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type RailId =
  | "card_eea"
  | "card_uk"
  | "card_intl"
  | "sepa_debit"
  | "wallet"
  | "momo_payout";

export type Rail = {
  readonly id: RailId;
  readonly label: string;
  /** Percentage fee in basis points. */
  readonly pctBps: number;
  /** Fixed fee per transaction — the line that makes splitting expensive. */
  readonly fixed: Money;
  /** Optional cap on the total fee. */
  readonly cap?: Money;
  /** Extra basis points when the payment needs currency conversion. */
  readonly fxBps: number;
  /** Days until the money is usable. Matters enormously for a funeral. */
  readonly settlementDays: number;
  /** How much work the contributor has to do the first time. */
  readonly friction: "one-tap" | "card-entry" | "mandate-setup";
};

export const RAILS: Record<RailId, Rail> = {
  card_eea: {
    id: "card_eea",
    label: "Card, EEA consumer",
    pctBps: 150,
    fixed: eur(0.25),
    fxBps: 200,
    settlementDays: 2,
    friction: "card-entry",
  },
  card_uk: {
    id: "card_uk",
    label: "Card, UK",
    pctBps: 250,
    fixed: eur(0.25),
    fxBps: 200,
    settlementDays: 2,
    friction: "card-entry",
  },
  card_intl: {
    id: "card_intl",
    label: "Card, non-EEA (US, CA, ZA…)",
    pctBps: 325,
    fixed: eur(0.25),
    fxBps: 200,
    settlementDays: 2,
    friction: "card-entry",
  },
  sepa_debit: {
    id: "sepa_debit",
    label: "SEPA Direct Debit",
    pctBps: 80,
    fixed: eur(0.25),
    cap: eur(6.0),
    fxBps: 0,
    // The catch. A mandate takes days to clear, which is fine for a wedding
    // booked three weeks out and useless for a funeral booked on Tuesday.
    settlementDays: 5,
    friction: "mandate-setup",
  },
  wallet: {
    id: "wallet",
    label: "Elongo balance (pre-funded)",
    // Already paid for on the way in, so contributing costs nothing marginal.
    pctBps: 0,
    fixed: 0,
    fxBps: 0,
    settlementDays: 0,
    friction: "one-tap",
  },
  momo_payout: {
    id: "momo_payout",
    label: "Mobile money payout (MTN / Airtel)",
    pctBps: 150,
    fixed: 0,
    fxBps: 0,
    settlementDays: 0,
    friction: "one-tap",
  },
};

/** Which rail a contributor in a given country would use by default. */
export function defaultRail(country: string): RailId {
  const eea = ["FR", "BE", "DE", "NL", "IT", "ES", "PT", "IE", "LU", "AT"];
  if (eea.includes(country)) return "card_eea";
  if (country === "UK" || country === "GB") return "card_uk";
  return "card_intl";
}

/** True when the payer's home currency is not the euro. */
export function needsFx(country: string): boolean {
  return !["FR", "BE", "DE", "NL", "IT", "ES", "PT", "IE", "LU", "AT"].includes(country);
}

export function feeFor(rail: Rail, amount: Money, fx: boolean): Money {
  const pct = bps(amount, rail.pctBps + (fx ? rail.fxBps : 0));
  const raw = pct + rail.fixed;
  return rail.cap === undefined ? raw : min(raw, rail.cap);
}

/**
 * The fee as a share of the payment — the number that shows why a €5 minimum
 * contribution exists. On a €2 contribution the fixed €0.25 alone is 12.5%.
 */
export function feeRatio(rail: Rail, amount: Money, fx: boolean): number {
  return amount === 0 ? 0 : feeFor(rail, amount, fx) / amount;
}

/**
 * The single payment that would net us the same as a pool did.
 *
 * This is the honest way to price the pool's processing cost, because it needs
 * no assumption about what a lone booker "would have" paid. Nine people paying
 * €10 nets what one person paying €86.62 nets; the gap is what the split cost
 * us, and it is then trivial to divide that gap by the new relatives the pool
 * introduced.
 */
export function equivalentSingleCharge(net: Money, rail: Rail, fx: boolean): Money {
  const p = (rail.pctBps + (fx ? rail.fxBps : 0)) / 10_000;
  return Math.round((net + rail.fixed) / (1 - p));
}

export function describeRail(rail: Rail): string {
  const pct = (rail.pctBps / 100).toFixed(2).replace(/\.?0+$/, "");
  const parts = [`${pct}%`];
  if (rail.fixed > 0) parts.push(`+ ${fmt(rail.fixed)}`);
  if (rail.cap !== undefined) parts.push(`(cap ${fmt(rail.cap)})`);
  return parts.join(" ");
}
