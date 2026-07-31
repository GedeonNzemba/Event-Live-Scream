#!/usr/bin/env node
/**
 * Check that this machine can actually run the apps.
 *
 *   npm run doctor          (from mobile/)
 *
 * Every check here corresponds to a failure that has already happened, and each
 * one produced an error message that pointed somewhere other than the cause:
 *
 *   - `npm install` never completed in mobile/, so Node walked up past the
 *     repository and resolved Expo out of the user's HOME directory. The stack
 *     trace was forty lines of /Users/<you>/node_modules/... which reads like a
 *     broken Expo install rather than a missing one.
 *   - A stray node_modules or package.json in an ancestor directory (HOME is
 *     the usual one) shadows the project's. Metro is protected by
 *     `disableHierarchicalLookup`, but the Expo CLI itself is not.
 *   - The fonts were missing, so Metro failed to resolve a .ttf and reported
 *     "Unable to resolve module", which most people read as a code error.
 *   - babel.config.js referenced react-native-worklets/plugin — Reanimated 4
 *     moved it into its own package — without it being a dependency.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c("32", s);
const red = (s) => c("31", s);
const yellow = (s) => c("33", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

const problems = [];
const warnings = [];

function ok(label, detail = "") {
  console.log(`  ${green("OK")}    ${label.padEnd(38)}${dim(detail)}`);
}
function bad(label, detail, fix) {
  console.log(`  ${red("FAIL")}  ${label.padEnd(38)}${dim(detail)}`);
  problems.push({ label, fix });
}
function warn(label, detail, fix) {
  console.log(`  ${yellow("WARN")}  ${label.padEnd(38)}${dim(detail)}`);
  warnings.push({ label, fix });
}

console.log("");
console.log(bold("  Elongo mobile — doctor"));
console.log(dim(`  ${"─".repeat(70)}`));

// --- 1. Node ---------------------------------------------------------------

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  bad("Node version", process.version, "Install Node 20 or newer.");
} else {
  ok("Node version", process.version);
}

// --- 2. The install landed here -------------------------------------------

const localModules = join(root, "node_modules");
if (!existsSync(localModules)) {
  bad(
    "mobile/node_modules",
    "missing",
    "Run `npm install` from mobile/ — not from an app directory and not from the repo root.",
  );
} else if (!existsSync(join(localModules, "expo"))) {
  bad(
    "expo installed locally",
    "node_modules exists but has no expo",
    "The install did not finish. Run `rm -rf node_modules package-lock.json && npm install` from mobile/.",
  );
} else {
  const version = JSON.parse(
    readFileSync(join(localModules, "expo", "package.json"), "utf8"),
  ).version;
  ok("expo installed locally", `v${version}`);
}

// The binary npx will actually pick. If this resolves outside the repository,
// every subsequent error will name paths that have nothing to do with the code.
const binary = join(localModules, ".bin", "expo");
if (existsSync(localModules) && !existsSync(binary)) {
  bad(
    "expo CLI on the local path",
    "mobile/node_modules/.bin/expo missing",
    "npx will fall back to a global or ancestor install. Reinstall from mobile/.",
  );
} else if (existsSync(binary)) {
  ok("expo CLI on the local path", "mobile/node_modules/.bin/expo");
}

// --- 3. Nothing above us is shadowing it ----------------------------------

/**
 * Walk from the repository up to the filesystem root looking for stray
 * node_modules or package.json. Node's resolver checks every one of these
 * before giving up, so a leftover install in HOME silently wins.
 */
const strays = [];
let dir = resolve(repo, "..");
for (;;) {
  if (existsSync(join(dir, "node_modules")) || existsSync(join(dir, "package.json"))) {
    strays.push(dir);
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

if (strays.length === 0) {
  ok("no shadowing installs above the repo");
} else {
  const home = homedir();
  for (const stray of strays) {
    const what = [
      existsSync(join(stray, "node_modules")) ? "node_modules" : null,
      existsSync(join(stray, "package.json")) ? "package.json" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    warn(
      "shadowing install above the repo",
      `${stray === home ? "~" : stray}${sep}${what}`,
      `Node resolves modules from ${stray} before giving up, so a partial install here ` +
        `can hijack the Expo CLI. If you did not put it there on purpose, remove it: ` +
        `rm -rf "${stray}/node_modules" "${stray}/package.json"`,
    );
  }
}

// --- 4. Babel plugins are real dependencies -------------------------------

for (const app of ["correspondent", "viewer"]) {
  const appDir = join(root, "apps", app);
  const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
  const declared = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const babel = readFileSync(join(appDir, "babel.config.js"), "utf8");

  // Every "package/plugin" or "package" string in the config. Option *values*
  // like "nativewind" are package names too, so the filter is on shape rather
  // than position: a bare identifier with no dash, slash or scope is a config
  // key (jsxImportSource) and not something to look up.
  const referenced = [...babel.matchAll(/["']([@\w][\w@/.-]*)["']/g)]
    .map((m) => m[1])
    .filter((name) => !name.startsWith("."))
    .filter((name) => name.includes("-") || name.includes("/") || name.startsWith("@"))
    .map((name) => (name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]))
    .filter((name) => name !== "babel-preset-expo");

  const missing = [...new Set(referenced)].filter((name) => !declared.has(name));
  if (missing.length > 0) {
    bad(
      `${app}: babel plugins declared`,
      `missing ${missing.join(", ")}`,
      `Add to apps/${app}/package.json: npm install ${missing.join(" ")} --workspace @elongo/${app}`,
    );
  } else {
    ok(`${app}: babel plugins declared`);
  }
}

// --- 5. Fonts --------------------------------------------------------------

const FONTS = [
  "Fraunces.ttf",
  "Switzer-Regular.otf",
  "Switzer-Medium.otf",
  "Switzer-Semibold.otf",
  "JetBrainsMono.ttf",
];

for (const app of ["correspondent", "viewer"]) {
  const dir = join(root, "apps", app, "assets", "fonts");
  const present = existsSync(dir) ? new Set(readdirSync(dir)) : new Set();
  const missing = FONTS.filter((f) => !present.has(f));
  if (missing.length > 0) {
    bad(
      `${app}: fonts`,
      `${missing.length} missing`,
      "Run `npm run fonts` from mobile/. Metro resolves these at bundle time, so a " +
        'missing file fails with "Unable to resolve module" before the app runs.',
    );
  } else {
    ok(`${app}: fonts`, "5 files");
  }
}

// --- 6. Workspace packages are linked -------------------------------------

if (existsSync(localModules)) {
  const linked = ["@elongo/domain", "@elongo/design", "@elongo/api"].filter((name) =>
    existsSync(join(localModules, ...name.split("/"))),
  );
  if (linked.length === 3) {
    ok("workspace packages linked", linked.join(", "));
  } else {
    bad(
      "workspace packages linked",
      `${linked.length} of 3`,
      "Reinstall from mobile/ so npm workspaces can create the links.",
    );
  }
}

// --- report ----------------------------------------------------------------

console.log(dim(`\n  ${"─".repeat(70)}`));

if (problems.length === 0 && warnings.length === 0) {
  console.log(green(bold("  Ready.")));
  console.log(dim("\n  cd apps/viewer && npx expo run:ios"));
  console.log(dim("  cd apps/correspondent && npx expo run:android\n"));
  console.log(dim("  Expo Go cannot load this project — expo-video, Skia, VisionCamera and"));
  console.log(dim("  expo-sqlite are all native modules it does not ship. Use run:ios/run:android,"));
  console.log(dim("  which build a development client, then `npx expo start --dev-client`.\n"));
} else {
  if (problems.length > 0) {
    console.log(red(bold(`  ${problems.length} problem(s):\n`)));
    for (const p of problems) {
      console.log(red(`  ${p.label}`));
      console.log(dim(`    ${p.fix}\n`));
    }
  }
  if (warnings.length > 0) {
    console.log(yellow(bold(`  ${warnings.length} warning(s):\n`)));
    for (const w of warnings) {
      console.log(yellow(`  ${w.label}`));
      console.log(dim(`    ${w.fix}\n`));
    }
  }
  process.exit(problems.length > 0 ? 1 : 0);
}
