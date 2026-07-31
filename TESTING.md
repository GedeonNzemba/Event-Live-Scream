# Testing this yourself

## First, the honest inventory

Before you spend time testing, know what you are testing. **Almost none of the product is
built.** What exists is a strategy and two runnable models of the parts that carry the most
risk.

| | Status |
| --- | --- |
| Strategy, business model, operations, architecture | **Written** — 11 documents in `docs/` |
| Network resilience model (ladder, power, store-and-forward) | **Runnable** — `prototype/`, 20 tests |
| Family pool model (fees, shortfalls, growth math) | **Runnable** — `pool/`, 29 tests |
| Android correspondent app | **Not built** |
| Backend, ingest, transcode, archive assembly | **Not built** |
| Browser player | **Not built** |
| Booking flow, WhatsApp integration | **Not built** |
| Payments, payouts, mobile money | **Not built** |
| Anything that touches a real camera or a real network | **Not built** |

The two models are **simulations**. They prove the design holds up under conditions we
believe resemble Congo. They do not prove the design works in Congo — only ten real events
can do that, which is what [docs/07](docs/07-roadmap-and-validation.md) is for.

That is deliberate, and it is the right order. The most expensive mistake available right now
would be to spend a year building an app before finding out whether ten families will pay
€25.

## Run everything in one command

Requires **Node 22.18 or newer** (it runs the TypeScript directly, no build step). Check with
`node --version`.

```bash
npm run verify
```

That runs both test suites, every CLI entry point and the error paths, and prints a single
pass/fail. It takes about 30 seconds, most of it simulating three-hour weddings.

If it passes, everything in this repository that can run, runs on your machine.

## Run the pieces individually

```bash
npm test                # both test suites
npm run demo            # the wedding simulation, then the money reports
npm run demo:network    # all five link profiles side by side
npm run demo:money      # fees, lifecycle and growth
```

Or go into either package directly:

```bash
cd prototype
npm run demo                                   # wedding worst case
npm run demo:all                               # every profile
node src/cli.ts --list                         # what the profiles are
node src/cli.ts pointe-noire-3g                # a specific one
node src/cli.ts rural-edge --hours=5 --battery=30
```

```bash
cd pool
npm run fees            # does splitting the bill destroy the margin?
npm run lifecycle       # a pool that does not fill up
npm run growth          # what the pool is worth as acquisition
```

## How to attack the claims

This is the more useful half. Every number in the README comes out of these models, so the
right question is not "does it run" but "is it lying to me". Here is how to check.

### 1. Prove the tests are real

A test suite that passes no matter what you do is decoration. Break something and confirm it
notices.

```bash
cd prototype
```

Open `src/pipeline/store.ts` and find `append()`. Add a line that silently drops content when
the network is bad — which is exactly what a conventional streaming stack does:

```ts
append(track: Track, capturedAt: number, bytes: number, coversSec = 1): Segment | null {
  if (bytes <= 0) return null;
  if (capturedAt > 5400 && capturedAt < 6600) return null;   // ← add this
```

Then `npm test`. Several tests should fail, including *"delivers the archive even when the
link dies for twenty minutes"*. **Undo it afterwards.**

Do the same in `pool/`: change the minimum contribution in `src/pool.ts` from `eur(5)` to
`eur(1)` and watch *"refuses contributions below the minimum"* fail.

### 2. Check the comparison is not rigged

The strongest claim in the repository is that a conventional video call loses the recording.
The comparison lives in `prototype/src/baseline.ts`, and it is deliberately *generous* to the
conventional call — read it. It adapts down to 150 kbps, keeps audio when video fails, and
only drops after 12 seconds of nothing.

Make it more generous still and see whether the conclusion survives:

```ts
const DROP_AFTER_STARVED_SEC = 60;   // was 12 — never drops
const RECONNECT_DELAY_SEC = 5;       // was 45 — instant recovery
```

Live delivery for the baseline improves. **Its archive is still 0%,** because it does not make
one, and that is the entire argument. If the conclusion depended on the baseline being
strawmanned, this is where you would catch it.

### 3. Check we do not claim an advantage where there is none

```bash
cd prototype && node src/cli.ts brazzaville-4g
```

On a good 4G cell, live delivery is roughly a tie. The report says so. If a model always
flatters its author, distrust it — this one is built to report the tie.

### 4. Push it until it breaks

```bash
node src/cli.ts rural-edge --hours=8 --battery=10
```

The battery dies partway through, and the report says `reached the booked end: no — battery
died`. It still delivers 100% of what it captured. That is the intended behaviour and the
honest limit: no encoder can make a flat phone last eight hours, which is why there is a
€18 power bank in the kit in [docs/05](docs/05-operations.md).

Other things worth trying:

```bash
node src/cli.ts wedding-worst-case --seed=1     # a different random afternoon
node src/cli.ts wedding-worst-case --seed=99
node src/cli.ts brazzaville-evening --hours=6   # a long ceremony on a busy cell
```

Run several seeds. If the headline numbers swing wildly, the model is fitted to one lucky
afternoon and should not be trusted.

### 5. Change the world and see if the conclusions change

The link profiles are **engineering approximations, not measurements from Brazzaville** — the
single biggest caveat in this repository. They live in `prototype/src/link/profiles.ts` and
are meant to be replaced.

Make conditions worse than we assumed:

```ts
"pointe-noire-3g": {
  baseKbps: 120,      // was 320
  microOutagesPerHour: 40,   // was 12
```

Re-run. The archive should stay at 100% and live quality should fall. **If harsher networks
made the design look better, something is wrong.** In fact they widen our advantage, because
the gap between best-effort live and guaranteed archive grows — the design fails safe, which
is the property worth checking.

### 6. Attack the money

```bash
cd pool
```

The fee rates in `src/rails.ts` are published list prices and **you should verify them against
a live Stripe quote** — they move, and they are negotiable above roughly €50k/month. Change
them and re-run `npm run fees`. If the real rates are double, does the pool still pay for
itself? (It does; the acquisition cost per new relative roughly doubles, from about €0.50 to
about €1.00, against €20 to buy one with advertising.)

Then attack the growth model, which is where the business case is most fragile:

```bash
npm run growth
```

Look at the `K=0.25` column. That is the pessimistic world, and it costs €4,500/month in
advertising to hold the phase-2 gate instead of €2,400. **Nothing in this repository proves
which column you are in.** Only real events do.

## What to look at, not just run

| File | Why it is worth reading |
| --- | --- |
| `prototype/src/encoder/controller.ts` | The three ideas that make the ladder work, each one a mistake made first |
| `prototype/src/pipeline/store.ts` | The store-and-forward inversion the whole archive guarantee rests on |
| `prototype/src/baseline.ts` | The comparison, and how generous it is to the other side |
| `prototype/src/link/profiles.ts` | The assumptions. Replace these with real measurements first |
| `pool/src/pool.ts` | The business rules — shortfall, overfunding, refunds |
| `pool/src/money.ts` | Why money is integer cents and never floating point |

## The tests are the promises

Both suites are written so that each test is a business commitment rather than a code detail.

`prototype/test/guarantees.test.ts` asserts what the refund policy in
[docs/05](docs/05-operations.md) sells: the archive reaches 100% on every profile, capture
never stops because the network stopped, audio outlives video on a starved link, a four-hour
ceremony completes on a phone at 35%, and the power bank turns a 20% phone from impossible
into routine.

`pool/test/pool.test.ts` asserts the money: splits reconstruct exactly, an underfunded pool
charges the booker rather than cancelling somebody's funeral, surplus becomes family credit,
refunds do not recover processing fees, and a solo booking has no viral value at all.

If you change a business rule, a test should fail. If none does, the rule was not really a
rule.

## What you cannot test here, and must test in Congo

Listed plainly, because these are the things that decide the company:

1. **Will anyone pay?** No model answers this. Ten events, €25, real money.
2. **Will a second relative chip in unprompted?** The pool coefficient. Everything in
   [docs/03](docs/03-business-model.md) depends on it.
3. **Are real Brazzaville networks like the profiles?** Capture real throughput traces during
   the first ten events and replace the fixtures. This is the first engineering task of
   phase 2.
4. **Will correspondents show up, reliably, on a Saturday?** Supply-side reliability is the
   quiet killer of marketplaces.
5. **Does a real encoder behave like the model?** Real H.264 overshoots on motion, and a
   dancing crowd at a wedding is the worst case for it.
