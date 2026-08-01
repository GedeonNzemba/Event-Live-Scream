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
  console.log(`  ${green("OK")}    ${label.padEnd(48)}${dim(detail)}`);
}
function bad(label, detail, fix) {
  console.log(`  ${red("FAIL")}  ${label.padEnd(48)}${dim(detail)}`);
  problems.push({ label, fix });
}
function warn(label, detail, fix) {
  console.log(`  ${yellow("WARN")}  ${label.padEnd(48)}${dim(detail)}`);
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

/**
 * Which `expo` binary will npx actually run?
 *
 * npx walks node_modules/.bin from the working directory upward and takes the
 * first hit. If that first hit is outside the repository, every subsequent
 * error names paths belonging to some unrelated project — which is precisely
 * how "Cannot find module 'react-native-worklets/plugin'" ends up printing
 * fourteen lines of /Users/<you>/node_modules/... and sending you looking for a
 * bug in Expo rather than a missing install here.
 *
 * This is the single most diagnostic line in the whole script, so it names the
 * real path rather than a yes/no.
 */
function resolveExpoBinaryLike(startDir) {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", "expo");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

for (const app of ["correspondent", "viewer"]) {
  const from = join(root, "apps", app);
  const picked = resolveExpoBinaryLike(from);
  if (!picked) {
    bad(
      `${app}: expo CLI npx would run`,
      "none found anywhere",
      "Run `npm install` from mobile/.",
    );
  } else if (!picked.startsWith(repo + sep)) {
    bad(
      `${app}: expo CLI npx would run`,
      picked.replace(homedir(), "~"),
      `npx would run an Expo from OUTSIDE this repository (${picked.replace(homedir(), "~")}). ` +
        "Every error it prints will name that project's paths. Run `npm install` from mobile/, " +
        "then re-run doctor and confirm this line points inside the repo.",
    );
  } else {
    ok(`${app}: expo CLI npx would run`, picked.slice(repo.length + 1));
  }
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

// --- 4b. The entry point ---------------------------------------------------

/**
 * Expo picks its entry point from the `main` field of whichever package.json it
 * considers the project root. When `main` is absent it silently falls back to
 * the legacy `expo/AppEntry`, which imports `../../App` — a file this project
 * has never had, because it uses expo-router.
 *
 * The resulting error names expo/AppEntry.js and ../../App, neither of which
 * appears anywhere in this repository, so it reads like a broken Expo install.
 * The real meaning is: *you started Expo from a directory that is not an app*.
 * mobile/, the repository root and the top-level app/ all qualify — none of them
 * has a `main`.
 */
for (const app of ["correspondent", "viewer"]) {
  const pkg = JSON.parse(readFileSync(join(root, "apps", app, "package.json"), "utf8"));
  if (pkg.main !== "expo-router/entry") {
    bad(
      `${app}: entry point`,
      `main is ${pkg.main ?? "unset"}`,
      `apps/${app}/package.json must set "main": "expo-router/entry".`,
    );
  } else {
    ok(`${app}: entry point`, "expo-router/entry");
  }
}

for (const [label, dir] of [
  ["mobile/", root],
  ["repository root", repo],
]) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.main) {
    warn(
      `${label} looks like an app`,
      `main is ${pkg.main}`,
      `${label} is not an Expo app and should not declare main.`,
    );
  }
}

// --- 4c. One package manager, not two -------------------------------------

/**
 * Expo picks a package manager by sniffing for lockfiles, and it wins over
 * whatever actually built the tree. A stray bun.lock, yarn.lock or
 * pnpm-lock.yaml anywhere in the workspace means `expo install` reinstalls all
 * ~1600 packages in that manager's layout, on top of an npm tree.
 *
 * The result is not a clean switch. It is a hybrid node_modules in which
 * @expo/cli's own files have moved underneath it mid-run, producing errors like
 * "Cannot find module './utils/autoAddConfigPlugins.js'" — an internal path that
 * looks like a bug in Expo and is really two package managers disagreeing.
 */
const LOCKFILES = ["bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"];
const foreignLocks = [];
for (const dir of [root, ...["correspondent", "viewer"].map((a) => join(root, "apps", a))]) {
  for (const lock of LOCKFILES) {
    if (existsSync(join(dir, lock))) foreignLocks.push(join(dir, lock));
  }
}
if (foreignLocks.length === 0) {
  ok("one package manager", "npm only");
} else {
  bad(
    "one package manager",
    foreignLocks.map((f) => f.slice(root.length + 1)).join(", "),
    "This repository is an npm workspace. Another manager's lockfile makes `expo install` " +
      `reinstall everything in that manager's layout on top of the npm tree. Remove: ${foreignLocks
        .map((f) => `rm "${f}"`)
        .join(" && ")} — then rm -rf node_modules && npm install.`,
  );
}

// --- 4d. Native peers must be hoisted together -----------------------------

/**
 * Reanimated resolves react-native-worklets from its own directory upward, and
 * its podspec refuses to install if it cannot find a matching version:
 *
 *     [!] Invalid `RNReanimated.podspec` file:
 *         [Reanimated] Failed to validate worklets version.
 *
 * In a workspace that reads as a version conflict. Usually it is not. If the two
 * packages land in *different* node_modules — one hoisted to mobile/, the other
 * nested under apps/viewer/ because something installed from inside that
 * directory — then Reanimated is looking upward from mobile/node_modules and
 * simply cannot see a copy that lives below it. The versions can both be correct
 * and the build still fails.
 *
 * So this checks co-location and versions, and reports which one is wrong.
 */
const PEERS = [
  ["react-native-reanimated", "react-native-worklets"],
];

function findPackage(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, "node_modules", name, "package.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

for (const [pkg, peer] of PEERS) {
  const pkgPath = findPackage(pkg, join(root, "apps", "viewer"));
  const peerPath = findPackage(peer, join(root, "apps", "viewer"));

  if (!pkgPath || !peerPath) {
    if (existsSync(localModules)) {
      bad(
        `${pkg} + ${peer}`,
        !pkgPath ? `${pkg} not installed` : `${peer} not installed`,
        "Run `npm install` from mobile/.",
      );
    }
    continue;
  }

  const pkgRoot = dirname(dirname(dirname(pkgPath)));
  const peerRoot = dirname(dirname(dirname(peerPath)));
  const pkgVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version;
  const peerVersion = JSON.parse(readFileSync(peerPath, "utf8")).version;

  if (pkgRoot !== peerRoot) {
    bad(
      `${pkg} + ${peer}`,
      "split across node_modules",
      `${pkg} is in ${pkgRoot}/node_modules and ${peer} is in ${peerRoot}/node_modules. ` +
        `${pkg} resolves its peer upward from its own directory, so it cannot see one nested ` +
        "below it, and pod install fails claiming a version mismatch that is not real. " +
        "Fix: rm -rf node_modules apps/*/node_modules && npm install, from mobile/.",
    );
  } else {
    ok(`${pkg} + ${peer}`, `${pkgVersion} + ${peerVersion}, co-located`);
  }
}

// mobile/App.tsx is the signpost Expo lands on when started from the wrong
// directory. Losing it turns a readable screen back into a stack trace.
if (existsSync(join(root, "App.tsx"))) {
  ok("wrong-directory signpost", "mobile/App.tsx");
} else {
  warn(
    "wrong-directory signpost",
    "mobile/App.tsx missing",
    "Starting Expo from mobile/ will fail with an unexplained 'Unable to resolve ../../App'.",
  );
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
  console.log(dim("\n  From mobile/ — these route to the right workspace on their own:\n"));
  console.log(dim("      npm run ios          the viewer, iOS"));
  console.log(dim("      npm run android      the correspondent, Android\n"));
  console.log(dim("  Running Expo by hand means cd-ing into an app directory first. Starting it"));
  console.log(dim("  from mobile/ or from the repository root makes Expo treat that directory as"));
  console.log(dim("  the project, fall back to its legacy entry point, and fail on a missing"));
  console.log(dim("  ../../App — a file this project has never had.\n"));
  console.log(dim("  Expo Go cannot load this project either: expo-video, Skia, VisionCamera and"));
  console.log(dim("  expo-sqlite are native modules it does not ship. run:ios/run:android build a"));
  console.log(dim("  development client; after that `npx expo start --dev-client` attaches to it.\n"));
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
