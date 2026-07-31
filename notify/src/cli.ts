import { dryRun } from "./drivers.ts";
import { Outbox } from "./outbox.ts";
import { TEMPLATES, type TemplateName } from "./templates.ts";

/**
 * Walks the whole customer journey and prints every message the family and the
 * correspondent would receive, with the running cost.
 *
 *   node src/cli.ts
 *
 * Written so the wording can be reviewed by somebody who actually speaks to
 * these families, without reading any application code.
 */

const useColour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);
const green = (s: string) => c("32", s);
const cyan = (s: string) => c("36", s);

const lines: string[] = [];
const outbox = new Outbox(dryRun((line) => lines.push(line)));

const LINK = "https://elongo.cg/g/8FA2KD";
const WATCH = "https://elongo.cg/v/8FA2KD";

type Step = {
  when: string;
  to: string;
  country: Parameters<typeof outbox.enqueue>[0]["country"];
  template: TemplateName;
  params: string[];
  ttlSec?: number;
};

const journey: Step[] = [
  {
    when: "Mardi 10:12 — Sylvain réserve",
    to: "06 12 34 56 78",
    country: "FR",
    template: "pool_created",
    params: ["Sylvain", "Mariage de Grace & Thierry", "89,00 €", LINK],
  },
  {
    when: "Mardi 21:40 — Bernadette participe",
    to: "+33 6 12 34 56 78",
    country: "FR",
    template: "pool_contribution",
    params: ["Bernadette", "10,00 €", "Mariage de Grace & Thierry", "64,00 €"],
  },
  {
    when: "Mercredi 08:03 — la cagnotte est pleine",
    to: "0612345678",
    country: "FR",
    template: "pool_funded",
    params: ["Mariage de Grace & Thierry", "9"],
  },
  {
    when: "Mercredi 09:15 — mission proposée à Merveille",
    to: "05 551 22 33",
    country: "CG",
    template: "gig_offer",
    params: ["Merveille", "samedi 14 mars", "14h00", "Makélékélé", "20 000 XAF"],
  },
  {
    when: "Vendredi 18:00 — veille de l'événement",
    to: "0612345678",
    country: "FR",
    template: "event_tomorrow",
    params: ["Mariage de Grace & Thierry", "14h00", "Merveille"],
  },
  {
    when: "Samedi 11:00 — rappel au correspondant",
    to: "05 551 22 33",
    country: "CG",
    template: "gig_reminder",
    params: ["14h00", "Makélékélé"],
  },
  {
    when: "Samedi 14:00 — ça commence",
    to: "0612345678",
    country: "FR",
    template: "event_starting",
    params: ["Mariage de Grace & Thierry", WATCH],
    // Worthless after the event; better silence than a message telling a
    // family they missed something.
    ttlSec: 30 * 60,
  },
  {
    when: "Samedi 15:35 — le réseau coupe",
    to: "0612345678",
    country: "FR",
    template: "recording_delayed",
    params: ["Mariage de Grace & Thierry", "82 %"],
  },
  {
    when: "Samedi 18:20 — tout est arrivé",
    to: "0612345678",
    country: "FR",
    template: "recording_ready",
    params: ["Mariage de Grace & Thierry", "3 h 58", WATCH],
  },
  {
    when: "Samedi 18:25 — Merveille est payé",
    to: "05 551 22 33",
    country: "CG",
    template: "payout_sent",
    params: ["20 000 XAF", "Mariage de Grace & Thierry"],
  },
];

console.log("");
console.log(bold("  Un mariage, du début à la fin"));
console.log(dim("  Every message the family and the correspondent receive."));
console.log(dim(`  ${"─".repeat(72)}`));

for (const [i, step] of journey.entries()) {
  lines.length = 0;
  outbox.enqueue({
    to: step.to,
    country: step.country,
    template: step.template,
    params: step.params,
    idempotencyKey: `journey-${i}`,
    ttlSec: step.ttlSec,
  });
  await outbox.flush();
  console.log("");
  console.log(cyan(`  ${step.when}`));
  console.log(lines.join("\n"));
}

console.log("");
console.log(dim(`  ${"─".repeat(72)}`));

const sent = outbox.byStatus("sent").length;
console.log(
  `  ${bold(String(sent))} messages · coût estimé ${bold(green(`${(outbox.spentCents / 100).toFixed(2)} €`))} pour cet événement`,
);
const perEvent = outbox.spentCents / 100;
const at = (n: number) => `${(perEvent * n).toFixed(0)} €`;
console.log("");
console.log(
  dim(`  At 50 presences a month that is about ${at(50)}/month, and at 300 about ${at(300)} —`),
);
console.log(dim("  far less than people expect, because Meta made service conversations free"));
console.log(dim("  when the customer messages first, and in this business they always do."));
console.log("");

// Deduplication, which is the failure mode that actually bites.
const before = outbox.all.length;
outbox.enqueue({
  to: "0612345678",
  country: "FR",
  template: "event_starting",
  params: ["Mariage de Grace & Thierry", WATCH],
  idempotencyKey: "journey-6",
});
console.log(
  outbox.all.length === before
    ? green("  Deduplication: a repeated send was refused, as it should be.")
    : "  Deduplication FAILED",
);

const registered = Object.keys(TEMPLATES).length;
console.log(dim(`  ${registered} templates to register with Meta before any of this goes live.`));
console.log("");
