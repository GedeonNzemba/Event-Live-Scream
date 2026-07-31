import { add, eur, type Money, splitEvenly, sub, suggestedShare, ZERO } from "./money.ts";
import { defaultRail, feeFor, needsFx, RAILS, type RailId } from "./rails.ts";

/**
 * The family pool.
 *
 * One event, one price, many payers. Everything commercially interesting about
 * this business lives in this object: it is simultaneously the revenue
 * multiplier (willingness to pay is heterogeneous, so letting people
 * self-select captures more than any single list price) and the entire
 * acquisition engine (every pool introduces the product to a dozen relatives
 * inside a private family group, vouched for by someone they trust).
 */

export type PoolState =
  | "open" // accepting contributions
  | "funded" // target reached, still accepting
  | "confirmed" // correspondent assigned, locked in
  | "delivered" // event captured, archive complete
  | "cancelled" // event called off, everyone refunded
  | "failed"; // we did not deliver, everyone refunded

export type Contribution = {
  readonly id: number;
  readonly name: string;
  readonly country: string;
  readonly amount: Money;
  readonly rail: RailId;
  readonly fee: Money;
  /** True when this person had never used Elongo before. Drives the growth model. */
  readonly firstTime: boolean;
  /** Set when the booker was charged for an unfunded remainder. */
  readonly isShortfallCharge: boolean;
};

export type PoolConfig = {
  readonly reference: string;
  readonly eventName: string;
  /** List price of the tier being bought. */
  readonly target: Money;
  /** Who created it, and who carries the shortfall. */
  readonly bookerName: string;
  readonly bookerCountry: string;
  /** How many relatives the booker expects, used only to suggest a share. */
  readonly expectedParticipants: number;
  /** Below this, the fixed processing fee eats an absurd share. */
  readonly minContribution?: Money;
  /** Surplus above this multiple of target is refused rather than banked. */
  readonly maxOverfundRatio?: number;
};

export type CloseResult = {
  readonly funded: boolean;
  readonly shortfall: Money;
  readonly shortfallChargedToBooker: Money;
  readonly surplus: Money;
  /** Surplus is not refunded — it becomes credit against the family's next event. */
  readonly familyCredit: Money;
};

export type RefundResult = {
  readonly refunded: Money;
  /** Processors do not return their fee on a refund. Cancellation costs real money. */
  readonly unrecoverableFees: Money;
  readonly contributorsRefunded: number;
};

const DEFAULT_MIN = eur(5);
const DEFAULT_MAX_OVERFUND = 1.5;

/** Everything needed to reconstruct a pool exactly, for storage. */
export type PoolSnapshot = {
  readonly config: PoolConfig;
  readonly contributions: readonly Contribution[];
  readonly state: PoolState;
  readonly closed: boolean;
  readonly nextId: number;
};

export class FamilyPool {
  readonly config: PoolConfig;
  private readonly contributions: Contribution[] = [];
  private nextId = 1;
  private state: PoolState = "open";
  private closed = false;

  constructor(config: PoolConfig) {
    if (config.target <= 0) throw new RangeError("target must be positive");
    this.config = config;
  }

  /**
   * Serialise for storage.
   *
   * Contributions are stored rather than replayed, because closing the pool
   * appends a shortfall charge — replaying a snapshot through `contribute`
   * would either drop that charge or double it.
   */
  toSnapshot(): PoolSnapshot {
    return {
      config: this.config,
      contributions: this.contributions.map((c) => ({ ...c })),
      state: this.state,
      closed: this.closed,
      nextId: this.nextId,
    };
  }

  static fromSnapshot(s: PoolSnapshot): FamilyPool {
    const pool = new FamilyPool(s.config);
    pool.contributions.push(...s.contributions.map((c) => ({ ...c })));
    pool.state = s.state;
    pool.closed = s.closed;
    pool.nextId = s.nextId;
    return pool;
  }

  // ---- reading -----------------------------------------------------------

  get status(): PoolState {
    return this.state;
  }

  get all(): readonly Contribution[] {
    return this.contributions;
  }

  get raised(): Money {
    return add(...this.contributions.map((c) => c.amount));
  }

  get remaining(): Money {
    return Math.max(0, sub(this.config.target, this.raised));
  }

  get isFunded(): boolean {
    return this.raised >= this.config.target;
  }

  get payerCount(): number {
    return this.contributions.length;
  }

  /** New-to-Elongo people this pool exposed. The acquisition number. */
  get firstTimers(): number {
    return this.contributions.filter((c) => c.firstTime).length;
  }

  get processingFees(): Money {
    return add(...this.contributions.map((c) => c.fee));
  }

  /** What actually lands in the bank. */
  get netRevenue(): Money {
    return sub(this.raised, this.processingFees);
  }

  /** The share each person is asked for, so equal payments always cover the target. */
  get suggested(): Money {
    return suggestedShare(this.config.target, Math.max(1, this.config.expectedParticipants));
  }

  /** An exact split that sums to the target, for display. */
  shares(n: number): Money[] {
    return splitEvenly(this.config.target, n);
  }

  private get minContribution(): Money {
    return this.config.minContribution ?? DEFAULT_MIN;
  }

  // ---- writing -----------------------------------------------------------

  contribute(
    name: string,
    country: string,
    amount: Money,
    opts: { rail?: RailId; firstTime?: boolean } = {},
  ): Contribution {
    if (this.closed) {
      throw new Error(`pool ${this.config.reference} is closed (${this.state})`);
    }
    if (amount < this.minContribution) {
      throw new RangeError(
        `contribution below the ${this.minContribution / 100} euro minimum; ` +
          `the fixed processing fee would take an unreasonable share of it`,
      );
    }
    const ceiling = Math.round(this.config.target * (this.config.maxOverfundRatio ?? DEFAULT_MAX_OVERFUND));
    if (this.raised + amount > ceiling) {
      throw new RangeError("contribution would push the pool past its overfunding ceiling");
    }

    const rail = opts.rail ?? defaultRail(country);
    const contribution: Contribution = {
      id: this.nextId++,
      name,
      country,
      amount,
      rail,
      fee: feeFor(RAILS[rail], amount, needsFx(country)),
      firstTime: opts.firstTime ?? true,
      isShortfallCharge: false,
    };
    this.contributions.push(contribution);

    if (this.state === "open" && this.isFunded) this.state = "funded";
    return contribution;
  }

  /**
   * Called at the booking deadline, typically 24 hours before the event.
   *
   * The rule that matters: **an underfunded pool is never a cancelled event.**
   * The booker agreed to carry the remainder when they created it, and their
   * card is charged the difference. Cancelling somebody's mother's funeral
   * because the seventh cousin did not pay would be an unrecoverable failure,
   * and no amount of saved margin is worth it.
   *
   * Surplus is not refunded either — it becomes credit against the family's
   * next event, which costs us nothing today and buys a return visit.
   */
  closeAtDeadline(): CloseResult {
    if (this.closed) throw new Error("pool already closed");
    this.closed = true;

    const shortfall = this.remaining;
    let charged: Money = ZERO;

    if (shortfall > 0) {
      const rail = defaultRail(this.config.bookerCountry);
      this.contributions.push({
        id: this.nextId++,
        name: this.config.bookerName,
        country: this.config.bookerCountry,
        amount: shortfall,
        rail,
        fee: feeFor(RAILS[rail], shortfall, needsFx(this.config.bookerCountry)),
        firstTime: false,
        isShortfallCharge: true,
      });
      charged = shortfall;
    }

    const surplus = Math.max(0, sub(this.raised, this.config.target));
    this.state = "confirmed";

    return {
      funded: shortfall === 0,
      shortfall,
      shortfallChargedToBooker: charged,
      surplus,
      familyCredit: surplus,
    };
  }

  markDelivered(): void {
    if (this.state !== "confirmed") {
      throw new Error(`cannot deliver from state "${this.state}"`);
    }
    this.state = "delivered";
  }

  /**
   * Refund everyone — either the event was called off, or we failed to deliver
   * the complete recording and the guarantee in docs/05 applies.
   *
   * Note what this costs: processors keep their fee on a refund, so every
   * cancellation is a real loss, not a wash. That is an argument for confirming
   * correspondents early rather than for being stingy with refunds.
   */
  refundAll(reason: "cancelled" | "failed"): RefundResult {
    const refunded = this.raised;
    const unrecoverableFees = this.processingFees;
    const n = this.contributions.length;
    this.closed = true;
    this.state = reason;
    return { refunded, unrecoverableFees, contributorsRefunded: n };
  }
}
