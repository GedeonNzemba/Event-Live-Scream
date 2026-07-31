#!/usr/bin/env node
/**
 * One command that checks everything in this repository actually works.
 *
 *   npm run verify
 *
 * Runs both test suites and every CLI entry point, including the error paths,
 * and reports a single pass/fail. Written for somebody who has just cloned this
 * and wants to know whether the claims in the README survive contact with their
 * own machine.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c("32", s);
const red = (s) => c("31", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

const checks = [];

/**
 * Reads the pass/fail counts out of a `node --test` run.
 *
 * Node's default test reporter changed between major versions — 22 emits TAP
 * (`# pass 20`), 24 emits the spec reporter (`ℹ pass 20`). An earlier version of
 * this script grepped for the TAP form and reported every suite as failing on
 * Node 24 while the suites themselves were green, which is a genuinely alarming
 * thing to show somebody about their own working code.
 *
 * We now pin `--test-reporter=tap` for determinism *and* accept either marker,
 * so this keeps working when the default changes again.
 */
function testCounts(out) {
  const read = (label) => {
    const m = new RegExp(`^[#ℹ\\s]*${label}\\s+(\\d+)\\s*$`, "m").exec(out);
    return m ? Number(m[1]) : null;
  };
  const pass = read("pass");
  const fail = read("fail");
  return pass === null || fail === null ? null : { pass, fail };
}

function check(name, cwd, args, { expectExit = 0, expectOut, isTest = false } = {}) {
  const started = Date.now();
  // Pin the reporter so the output format does not depend on the Node version.
  const finalArgs = isTest ? [args[0], "--test-reporter=tap", ...args.slice(1)] : args;

  const r = spawnSync(process.execPath, finalArgs, {
    cwd: join(root, cwd),
    encoding: "utf8",
    // Tests spawn subprocesses and simulate three-hour events; be generous.
    timeout: 180_000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;

  let ok = r.status === expectExit;
  let why = ok ? "" : `exit ${r.status}, expected ${expectExit}`;
  let detail = "";

  if (isTest) {
    const counts = testCounts(out);
    if (counts) {
      detail = `${counts.pass} passed`;
      if (counts.fail > 0) {
        ok = false;
        why = `${counts.fail} test${counts.fail === 1 ? "" : "s"} failed`;
      }
    } else if (ok) {
      // The exit code is the authority; if we cannot parse counts, say so
      // rather than inventing a failure.
      detail = "counts unreadable";
    }
  } else if (ok && expectOut && !expectOut.test(out)) {
    ok = false;
    why = `output did not match ${expectOut}`;
  }

  checks.push({ name, ok, why, ms: Date.now() - started, out });
  process.stdout.write(
    `  ${ok ? green("PASS") : red("FAIL")}  ${name.padEnd(42)}` +
      `${dim(detail.padEnd(14))}${dim(`${Date.now() - started}ms`)}\n`,
  );
  if (!ok) process.stdout.write(`        ${red(why)}\n`);
}

console.log("");
console.log(bold("  Verifying Elongo"));
console.log(dim(`  node ${process.version} · ${root}`));
console.log(dim(`  ${"─".repeat(70)}`));

// Node 22.18+ is required for running TypeScript directly and for node:test.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    red(`\n  Node ${process.version} is too old. This repository needs 22.18 or newer,\n`) +
      "  which is what runs the TypeScript directly without a build step.\n",
  );
  process.exit(1);
}

for (const dir of ["prototype", "pool", "app", "media", "notify"]) {
  if (!existsSync(join(root, dir))) {
    console.error(red(`\n  Missing directory: ${dir}\n`));
    process.exit(1);
  }
}

console.log(bold("\n  Test suites"));
check("presence-engine: guarantees", "prototype", ["--test", "test/guarantees.test.ts"], {
  isTest: true,
});
check("family-pool: money and rules", "pool", ["--test", "test/money.test.ts", "test/pool.test.ts"], {
  isTest: true,
});
check("app: booking, pool and escaping", "app", ["--test", "test/app.test.ts"], {
  isTest: true,
});
check("media: ingest, tokens and completeness", "media", ["--test", "test/media.test.ts"], {
  isTest: true,
});
check("notify: templates, phones, SMS and outbox", "notify", ["--test", "test/notify.test.ts", "test/sms.test.ts"], {
  isTest: true,
});

console.log(bold("\n  Network simulation"));
check("wedding worst case", "prototype", ["src/cli.ts"], {
  expectOut: /recording completeness\s+\S*100\.0%/,
});
check("all five link profiles", "prototype", ["src/cli.ts", "--all"], {
  expectOut: /Rural Congo, EDGE/,
});
check("profile listing", "prototype", ["src/cli.ts", "--list"]);
check("four-hour event, flat battery", "prototype", [
  "src/cli.ts",
  "brazzaville-evening",
  "--hours=4",
  "--battery=25",
]);

console.log(bold("\n  Money model"));
check("fees report", "pool", ["src/cli.ts", "fees"], { expectOut: /per new/ });
check("pool lifecycle", "pool", ["src/cli.ts", "lifecycle"], { expectOut: /charged to the booker/ });
check("growth model", "pool", ["src/cli.ts", "growth"], { expectOut: /roadmap gate/ });
check("message journey", "notify", ["src/cli.ts"], { expectOut: /coût estimé/ });

console.log(bold("\n  Error handling"));
check("rejects unknown link profile", "prototype", ["src/cli.ts", "made-up-profile"], {
  expectExit: 1,
  expectOut: /Unknown link profile/,
});
check("rejects negative duration", "prototype", ["src/cli.ts", "--hours=-1"], {
  expectExit: 1,
  expectOut: /must be a positive number/,
});
check("rejects impossible battery", "prototype", ["src/cli.ts", "--battery=250"], {
  expectExit: 1,
  expectOut: /between 1 and 100/,
});
check("rejects unknown report", "pool", ["src/cli.ts", "made-up-report"], {
  expectExit: 1,
  expectOut: /Unknown report/,
});

const failed = checks.filter((x) => !x.ok);
console.log(dim(`\n  ${"─".repeat(70)}`));

if (failed.length === 0) {
  console.log(green(bold(`  All ${checks.length} checks passed.`)));
  console.log(dim("  Everything in this repository that can run, runs.\n"));
  console.log(dim("  Not included here: the browser end-to-end run, which drives a real camera"));
  console.log(dim("  through capture, blackout, backfill and playback:\n"));
  console.log(dim("      npm run test:e2e\n"));
  console.log(dim("  Still not built: real payments, WhatsApp delivery, Talk mode. See TESTING.md.\n"));
} else {
  console.log(red(bold(`  ${failed.length} of ${checks.length} checks failed:\n`)));
  for (const f of failed) {
    console.log(red(`  ${f.name}`));
    console.log(dim(`    ${f.why}`));
    console.log(dim(`    ${f.out.split("\n").slice(-12).join("\n    ")}\n`));
  }
  process.exit(1);
}
