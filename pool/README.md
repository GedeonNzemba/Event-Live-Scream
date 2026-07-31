# The family pool

A runnable model of the mechanic [docs/03](../docs/03-business-model.md) calls the most
important commercial idea in the company, and [docs/07](../docs/07-roadmap-and-validation.md)
says to build first: **one event, one price, many payers.**

No dependencies. Node 22.18+.

```bash
npm test           # money arithmetic and the business rules
npm run demo       # all three reports
npm run fees       # does splitting the bill destroy the margin?
npm run lifecycle  # a pool from creation to delivery, shortfall included
npm run growth     # what the pool is worth as an acquisition channel
```

## Why model this before building it

The pool decides three separate things, and getting any of them wrong is expensive:

1. **Whether split payments destroy the margin.** Every payment carries its own fixed fee, so
   nine contributions cost far more to process than one. How much more, and does it matter?
2. **What happens when the pool does not fill up** — the day before somebody's grandmother's
   birthday, or worse, a funeral.
3. **How much the pool is actually worth as acquisition**, which is the assumption the entire
   LTV:CAC claim in docs/03 rests on and which docs/08 lists as risk #2.

## What it found

### Splitting costs more, and is worth roughly forty times what it costs

```
event                        raised    fees      net  ≡ one payer   new   per new
Mariage de Grace & Thierry   €90.00    5.5%   €85.07       €86.62     7     €0.48
Matanga de Papa Émile       €267.00    4.0%  €256.33      €260.49    12     €0.54
Anniversaire de Mamie Jos    €39.00    3.5%   €37.65       €38.48     1     €0.52
```

The **`≡ one payer`** column is the honest comparison, and it needs no assumption about what
a lone booker "would have" paid: it is the single charge that would have netted us exactly
the same. Nine relatives paying €10 nets what one person paying €86.62 nets. The €3.38 gap
*is* the cost of splitting.

Divide that gap by the relatives the pool introduced and you get **about €0.50 per new
customer, against roughly €20 to acquire one with advertising.**

That reframes the whole question. Splitting a bill is not a cost to be minimised; it is the
cheapest acquisition channel available to this company, and it happens to arrive disguised as
a payment-processing line item.

### The fixed fee is the entire problem

Same rail, different amounts:

```
    €2.00   ██████████████████████████ 14.0%
    €5.00   ██████████████ 6.6%
   €10.00   ████████ 4.0%
   €20.00   ██████ 2.8%
   €89.00   ████ 1.8%
```

Hence the **€5 minimum contribution** — not to squeeze anyone, but because below it the
processor takes a share of a gift to a bereaved family that nobody would agree to if it were
shown to them.

### International relatives cost noticeably more to accept

A contribution from Montréal or Johannesburg costs about twice what the same amount from
Paris does — non-EEA card rates plus currency conversion. Nine relatives spread across five
countries pay €4.93 in fees where nine French relatives would pay €3.60.

This is worth knowing before pricing, and it is an argument for eventually settling in local
currency per corridor rather than converting everything to euros.

### Settlement speed is the constraint nobody expects

SEPA Direct Debit is much cheaper than cards and takes about five days to clear. A *matanga*
is booked four days before the burial.

**So: offer bank debit for weddings booked weeks ahead, never for the bereavement lane.** The
cheapest rail is unusable for the most valuable events, which is not obvious until you put
settlement time and booking notice in the same model.

### An underfunded pool is never a cancelled event

The rule the state machine enforces: at the deadline, the booker's card is charged the
remainder. They agreed to that when they created the pool.

Cancelling a funeral stream because the seventh cousin did not pay would be an unrecoverable
failure, and no amount of saved margin is worth it. Surplus goes the other way — a funeral
routinely overfunds, because nobody wants to be the relative who gave least — and it becomes
credit against the family's next event rather than a refund or profit. That costs nothing
today and buys a return visit from a family we have just served at the worst moment of their
year.

### Refunds are a real loss, not a wash

Processors keep their fee on a refund. A failed delivery on the Grace wedding costs €90 in
refunds **plus** €4.93 that never comes back. That is an argument for confirming
correspondents early, not for being stingy with the guarantee.

### K is the number that sets the raise

The viral coefficient — new bookers generated per booking — is `(poolSize − 1) × newFraction
× activationRate`. It compounds, so small differences dominate everything:

```
What each roadmap gate costs in marketing
                                 K=0.25       K=0.42       K=0.60       K=0.75
Phase 1 gate · 50/mo            €750.00      €580.00      €400.00      €250.00
Phase 2 gate · 300/mo         €4 500.00    €3 480.00    €2 400.00    €1 500.00
Phase 3 target · 2000/mo     €30 000.00   €23 200.00   €16 000.00   €10 000.00
```

Same milestone, three times the burn, decided entirely by whether relatives who watched
somebody else's wedding go on to book their own.

Inverting it is the useful direction: **docs/03's blended CAC of about €11.50 requires
K ≈ 0.43**, which at a pool of nine means roughly **7% of newly-exposed relatives later book
an event themselves.** That is a plausible number rather than a heroic one — and, critically,
it is observable in the thirty-day concierge phase for the price of asking ten families
whether a second relative chipped in unprompted.

**Measure K before believing anything else in the business case.**

## Design notes

**Money is integer minor units, never floating point.** `89 / 9` in binary floating point is
9.888888888888889, and nine of those sum to 89.00000000000001 — so a pool reports itself a
cent short of its target and never closes, or one contributor is charged a cent more than the
others and notices. `splitEvenly` distributes remainder cents one at a time and is tested to
sum back exactly for every total and every party size up to twenty.

**The suggested share rounds up.** The UI shows one number to everybody; if it rounded down, a
pool that everyone funds at the suggested amount would land short.

**Payment rates live in one table** at the top of `src/rails.ts`, flagged for verification.
They are published list rates for a European Stripe account and they move — get a live quote,
and negotiate above roughly €50k/month. The value here is the *shape* of the problem, not the
basis points.

## What it does not model

- **Conversion.** Whether a €10 ask converts better than an €89 one is the central question
  and this cannot answer it. Only the concierge phase can.
- **Chargebacks and disputes**, which have their own fees and will matter at volume.
- **Tax.** VAT treatment of a service delivered in Congo and sold to a French consumer is a
  real question for an accountant, not for this file.
- **Mobile money on the collection side.** Modelled for payouts only; diaspora contributions
  are card and bank debit.
