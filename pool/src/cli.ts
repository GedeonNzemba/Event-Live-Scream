import { growth, requiredActivation, requiredK } from "./growth.ts";
import { eur, fmt, type Money } from "./money.ts";
import { FamilyPool } from "./pool.ts";
import { defaultRail, equivalentSingleCharge, feeFor, feeRatio, needsFx, RAILS } from "./rails.ts";
import { bar, bold, cyan, dim, green, heading, padVisible, pct, red, rule, yellow } from "./report.ts";
import { buildPool, getScenario, SCENARIOS } from "./scenarios.ts";

/**
 *   node src/cli.ts            all three reports
 *   node src/cli.ts fees       does splitting the bill destroy the margin?
 *   node src/cli.ts lifecycle  a pool from creation to delivery, shortfall included
 *   node src/cli.ts growth     what the pool is worth as an acquisition channel
 */

// ---------------------------------------------------------------- fees ----

function feesReport(): void {
  heading(
    "Does splitting the bill destroy the margin?",
    "Every payment carries its own fixed fee, so nine payments cost far more than one.",
  );

  console.log(
    `  ${"event".padEnd(26)}${"raised".padStart(9)}${"fees".padStart(8)}${"net".padStart(9)}` +
      `${"≡ one payer".padStart(13)}${"new".padStart(6)}${"per new".padStart(10)}`,
  );
  console.log(`  ${rule()}`);

  let totalExtra = 0;
  let totalNew = 0;

  for (const s of SCENARIOS) {
    const pool = buildPool(s);
    // Close first, so an underfunded pool reflects the booker's shortfall
    // charge rather than pretending the money never arrived.
    pool.closeAtDeadline();

    const bookerRail = RAILS[defaultRail(s.config.bookerCountry)];
    const fx = needsFx(s.config.bookerCountry);
    const feeShare = pool.processingFees / pool.raised;

    // The assumption-free comparison: what would one person have had to pay to
    // leave us equally well off?
    const equiv = equivalentSingleCharge(pool.netRevenue, bookerRail, fx);
    const extra = pool.raised - equiv;
    const perNew = pool.firstTimers > 0 ? Math.round(extra / pool.firstTimers) : 0;

    totalExtra += extra;
    totalNew += pool.firstTimers;

    console.log(
      `  ${s.title.slice(0, 25).padEnd(26)}` +
        padVisible(bold(fmt(pool.raised)), fmt(pool.raised), 9) +
        padVisible(feeShare > 0.05 ? yellow(pct(feeShare)) : dim(pct(feeShare)), pct(feeShare), 8) +
        padVisible(fmt(pool.netRevenue), fmt(pool.netRevenue), 9) +
        padVisible(dim(fmt(equiv)), fmt(equiv), 13) +
        padVisible(cyan(String(pool.firstTimers)), String(pool.firstTimers), 6) +
        padVisible(green(fmt(perNew)), fmt(perNew), 10),
    );
  }

  console.log("");
  console.log(`  ${dim("≡ one payer")}   the single charge that would have netted us the same,`);
  console.log(`  ${dim("             so the gap is exactly what splitting cost — no assumptions")}`);
  console.log(`  ${dim("per new")}       that gap divided by the relatives the pool introduced`);
  console.log("");
  console.log(
    `  ${bold("The punchline:")} splitting these three events cost ${bold(fmt(totalExtra))} in extra`,
  );
  console.log(
    `  processing and introduced ${bold(String(totalNew))} new relatives — about ${bold(fmt(Math.round(totalExtra / totalNew)))} each,`,
  );
  console.log(`  against a paid acquisition cost of roughly €20.`);
  console.log("");
  console.log(`  ${dim("Splitting a bill is genuinely more expensive to process. It is also the")}`);
  console.log(`  ${dim("cheapest customer acquisition available to this company by a factor of")}`);
  console.log(`  ${dim("about forty. Never optimise it away.")}`);

  // ---- where the fee actually goes
  const s = getScenario("wedding");
  const pool = buildPool(s);

  heading(
    "Where the fee goes — Mariage de Grace & Thierry",
    "Nine relatives, five countries, one wedding.",
  );
  console.log(
    `  ${"contributor".padEnd(14)}${"".padEnd(5)}${"amount".padStart(9)}${"fee".padStart(9)}` +
      `${"fee %".padStart(8)}   rail`,
  );
  console.log(`  ${rule()}`);
  for (const con of pool.all) {
    const ratio = con.fee / con.amount;
    console.log(
      `  ${con.name.padEnd(14)}${dim(con.country.padEnd(5))}` +
        padVisible(fmt(con.amount), fmt(con.amount), 9) +
        padVisible(fmt(con.fee), fmt(con.fee), 9) +
        padVisible(ratio > 0.05 ? yellow(pct(ratio)) : dim(pct(ratio)), pct(ratio), 8) +
        `   ${dim(RAILS[con.rail].label)}`,
    );
  }
  console.log(`  ${rule()}`);
  console.log(
    `  ${"total".padEnd(19)}` +
      padVisible(bold(fmt(pool.raised)), fmt(pool.raised), 9) +
      padVisible(bold(fmt(pool.processingFees)), fmt(pool.processingFees), 9) +
      padVisible(
        pct(pool.processingFees / pool.raised),
        pct(pool.processingFees / pool.raised),
        8,
      ),
  );

  console.log("");
  console.log(`  ${bold("The fixed fee is the whole problem.")} Same rail, different amounts:`);
  console.log("");
  const eeaCard = RAILS.card_eea;
  for (const amount of [eur(2), eur(5), eur(10), eur(20), eur(50), eur(89)]) {
    const r = feeRatio(eeaCard, amount, false);
    const colour = r > 0.06 ? red : r > 0.035 ? yellow : green;
    console.log(
      `    ${fmt(amount).padStart(7)}   ${colour(bar(r * 8, 26))} ${colour(pct(r))}`,
    );
  }
  console.log("");
  console.log(
    `  ${dim(`A €2 contribution loses ${pct(feeRatio(eeaCard, eur(2), false))} to processing. That is why the minimum`)}`,
  );
  console.log(`  ${dim("contribution is €5 — not to squeeze anyone, but because below that the")}`);
  console.log(`  ${dim("processor takes a share of the gift that nobody would consent to.")}`);

  // ---- mitigations
  heading("What the mitigations are worth", "Same wedding, same nine people, different rails.");

  const asIs = pool.processingFees;

  const sepa = new FamilyPool(s.config);
  for (const r of s.relatives) {
    const eea = ["FR", "BE", "DE", "NL"].includes(r.country);
    sepa.contribute(r.name, r.country, eur(r.amount), {
      rail: eea ? "sepa_debit" : undefined,
      firstTime: r.firstTime,
    });
  }

  const wallet = new FamilyPool(s.config);
  for (const r of s.relatives) {
    wallet.contribute(r.name, r.country, eur(r.amount), {
      rail: r.firstTime ? undefined : "wallet",
      firstTime: r.firstTime,
    });
  }

  const allWallet = new FamilyPool(s.config);
  for (const r of s.relatives) {
    allWallet.contribute(r.name, r.country, eur(r.amount), {
      rail: "wallet",
      firstTime: r.firstTime,
    });
  }

  const rows: Array<[string, Money, string]> = [
    ["Cards everywhere (today)", asIs, "no friction, no setup"],
    ["SEPA debit for EEA payers", sepa.processingFees, "5 days to clear — useless for a funeral"],
    ["Returning payers on balance", wallet.processingFees, "needs them to have pre-funded once"],
    ["Everyone on balance (year 3)", allWallet.processingFees, "the destination, not the start"],
  ];

  for (const [label, fee, caveat] of rows) {
    const saved = asIs - fee;
    console.log(
      `  ${label.padEnd(30)}` +
        padVisible(fmt(fee), fmt(fee), 8) +
        padVisible(saved > 0 ? green(`−${fmt(saved)}`) : dim("—"), saved > 0 ? `-${fmt(saved)}` : "—", 10) +
        `   ${dim(caveat)}`,
    );
  }
  console.log("");
  console.log(`  ${dim("Settlement speed is the constraint nobody expects. SEPA is much cheaper")}`);
  console.log(`  ${dim("and takes five days; a matanga is booked four days before the burial.")}`);
  console.log(`  ${dim("Offer SEPA for weddings booked weeks ahead, never for the bereavement lane.")}`);
}

// ----------------------------------------------------------- lifecycle ----

function lifecycleReport(): void {
  heading(
    "A pool from creation to delivery",
    "Including the case the business rules exist for: it does not fill up.",
  );

  const s = getScenario("birthday");
  const pool = new FamilyPool(s.config);

  console.log(`  ${bold(s.config.eventName)}`);
  console.log(`  ${dim(`target ${fmt(s.config.target)} · booked by ${s.config.bookerName}`)}`);
  console.log(
    `  ${dim(`suggested share for ${s.config.expectedParticipants}: ${fmt(pool.suggested)} each`)}`,
  );
  console.log("");

  const showState = (note: string) => {
    const filled = pool.raised / s.config.target;
    console.log(
      `  ${cyan(pool.status.padEnd(10))} ${bar(filled, 24)}${dim("░".repeat(Math.max(0, 24 - Math.round(filled * 24))))} ` +
        `${fmt(pool.raised)} / ${fmt(s.config.target)}   ${dim(note)}`,
    );
  };

  showState("created, nobody has paid");
  for (const r of s.relatives) {
    pool.contribute(r.name, r.country, eur(r.amount), { firstTime: r.firstTime });
    showState(`${r.name} contributes ${fmt(eur(r.amount))}`);
  }

  console.log("");
  console.log(`  ${yellow("Deadline reached, and the pool is short.")}`);
  console.log("");

  const close = pool.closeAtDeadline();
  console.log(`    shortfall                 ${fmt(close.shortfall)}`);
  console.log(
    `    charged to the booker     ${bold(fmt(close.shortfallChargedToBooker))} ${dim("(Aline, agreed at creation)")}`,
  );
  console.log(`    final state               ${cyan(pool.status)}`);
  console.log("");
  console.log(`  ${bold("The rule:")} an underfunded pool is never a cancelled event. Cancelling`);
  console.log(`  somebody's grandmother's birthday — or worse, a funeral — because the`);
  console.log(`  seventh cousin did not pay would be unrecoverable. The booker carries it,`);
  console.log(`  and they agreed to that when they created the pool.`);

  pool.markDelivered();
  console.log("");
  console.log(`  ${green("delivered")} — archive complete, ${pool.payerCount} payers, net ${fmt(pool.netRevenue)}`);

  // The other direction.
  heading("The opposite problem: a funeral overfunds", "Nobody wants to be the relative who gave least.");
  const m = getScenario("matanga");
  const mp = buildPool(m);
  const mc = mp.closeAtDeadline();

  console.log(`  target                      ${fmt(m.config.target)}`);
  console.log(`  raised from ${String(mp.payerCount).padStart(2)} relatives     ${bold(fmt(mp.raised))}`);
  console.log(`  surplus                     ${green(fmt(mc.surplus))}`);
  console.log("");
  console.log(`  ${dim("Surplus is not refunded and not pocketed — it becomes credit against the")}`);
  console.log(`  ${dim("family's next event. It costs nothing today and buys a return visit from")}`);
  console.log(`  ${dim("a family that has just been through the event we most want to serve well.")}`);

  // And the expensive failure.
  heading("If we fail to deliver", "The guarantee in docs/05, priced honestly.");
  const f = buildPool(getScenario("wedding"));
  const refund = f.refundAll("failed");
  console.log(`  refunded to ${refund.contributorsRefunded} contributors    ${fmt(refund.refunded)}`);
  console.log(`  processing fees not returned    ${red(fmt(refund.unrecoverableFees))}`);
  console.log("");
  console.log(`  ${dim("Processors keep their fee on a refund, so every failure costs real money")}`);
  console.log(`  ${dim("on top of the lost revenue. That is an argument for confirming")}`);
  console.log(`  ${dim("correspondents early — not for being stingy with refunds.")}`);
}

// -------------------------------------------------------------- growth ----

function growthReport(): void {
  heading(
    "What the pool is worth as an acquisition channel",
    "docs/03 claims LTV:CAC of 9-17x and admits it rests entirely on this.",
  );

  const LTV = eur(140);
  const PAID_CAC = eur(20);

  console.log(`  ${dim(`assuming LTV ${fmt(LTV)} and paid CAC ${fmt(PAID_CAC)} (docs/03)`)}`);
  console.log("");
  console.log(
    `  ${"pool".padStart(6)}${"activation".padStart(12)}${"K".padStart(8)}` +
      `${"amplif.".padStart(10)}${"blended CAC".padStart(13)}${"LTV:CAC".padStart(10)}`,
  );
  console.log(`  ${rule()}`);

  for (const poolSize of [3, 6, 9, 14]) {
    for (const activation of [0.05, 0.1, 0.15]) {
      const g = growth({
        poolSize,
        newFraction: 0.75,
        activationRate: activation,
        paidCac: PAID_CAC,
        ltv: LTV,
      });
      const ratio = g.selfSustaining ? "∞" : `${g.ltvCacRatio.toFixed(1)}×`;
      const colour = g.ltvCacRatio >= 9 ? green : g.ltvCacRatio >= 4 ? yellow : red;
      console.log(
        `  ${String(poolSize).padStart(6)}${pct(activation, 0).padStart(12)}` +
          `${g.k.toFixed(2).padStart(8)}` +
          `${(g.selfSustaining ? "∞" : `${g.amplification.toFixed(1)}×`).padStart(10)}` +
          padVisible(colour(fmt(g.blendedCac)), fmt(g.blendedCac), 13) +
          padVisible(colour(ratio), ratio, 10),
      );
    }
  }

  console.log("");
  const need = requiredK(PAID_CAC, eur(11.5));
  const act = requiredActivation(need, 9, 0.75);
  console.log(`  ${bold("Reading this back into docs/03:")}`);
  console.log(
    `  a blended CAC around ${fmt(eur(11.5))} needs ${bold(`K ≈ ${need.toFixed(2)}`)}, which at a pool of 9`,
  );
  console.log(
    `  means about ${bold(pct(act, 0))} of newly-exposed relatives later book an event themselves.`,
  );
  console.log("");
  console.log(`  ${dim("That is a plausible number, not a heroic one — and crucially it is")}`);
  console.log(`  ${dim("measurable in the concierge phase. It is also the single most important")}`);
  console.log(`  ${dim("number in the company: at K=0.4 the business needs paid acquisition and")}`);
  console.log(`  ${dim("a bigger raise; at K=0.7 it largely grows itself.")}`);

  console.log("");
  console.log(`  ${dim("Ignore the bottom rows. A sustained K above about 0.7 is very rare and")}`);
  console.log(`  ${dim("nothing should be planned around it — but the top rows are the warning:")}`);
  console.log(`  ${dim("small pools with low activation leave you buying growth at full price.")}`);

  // What this costs in marketing, which is the decision it actually drives.
  heading(
    "What each roadmap gate costs in marketing",
    "Monthly paid-acquisition budget needed to sustain the phase gates in docs/07.",
  );

  const gates: Array<[string, number]> = [
    ["Phase 1 gate", 50],
    ["Phase 2 gate", 300],
    ["Phase 3 target", 2000],
  ];
  const ks = [0.25, 0.42, 0.6, 0.75];

  console.log(
    `  ${"".padEnd(26)}${ks.map((k) => `K=${k.toFixed(2)}`.padStart(13)).join("")}`,
  );
  console.log(`  ${rule()}`);
  for (const [label, bookings] of gates) {
    const cells = ks
      .map((k) => {
        // At equilibrium, bookings = paid / (1 - K), so paid = bookings × (1 - K).
        const paidPerMonth = bookings * (1 - k);
        const budget = Math.round(paidPerMonth * PAID_CAC);
        return fmt(budget).padStart(13);
      })
      .join("");
    console.log(`  ${`${label} · ${bookings}/mo`.padEnd(26)}${cells}`);
  }

  console.log("");
  console.log(`  ${dim("Read the Phase 2 row. Reaching 300 presences a month costs about")}`);
  console.log(
    `  ${dim("€4,500/month in acquisition at K=0.25 and about €1,500/month at K=0.75 —")}`,
  );
  console.log(`  ${dim("the same milestone, three times the burn, decided entirely by whether")}`);
  console.log(`  ${dim("relatives who watched somebody else's wedding go on to book their own.")}`);
  console.log("");
  console.log(`  ${bold("So measure K first.")} It sets the raise, the runway and the plan. And it`);
  console.log(`  is observable in the concierge phase for the price of asking ten families`);
  console.log(`  whether a second relative chipped in without being pushed.`);
}

// ---------------------------------------------------------------- main ----

const which = process.argv[2] ?? "all";
if (which === "fees") feesReport();
else if (which === "lifecycle") lifecycleReport();
else if (which === "growth") growthReport();
else {
  feesReport();
  lifecycleReport();
  growthReport();
}
console.log("");
