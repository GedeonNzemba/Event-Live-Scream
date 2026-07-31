#!/usr/bin/env node
/**
 * Download the three typefaces both apps need.
 *
 *   npm run fonts            (from mobile/)
 *
 * The font files are not committed: they are third-party binaries and the
 * repository has no reason to carry them. But they are not optional either —
 * `_layout.tsx` requires them by path, Metro resolves that at bundle time, and a
 * missing file produces "Unable to resolve module ../assets/fonts/Fraunces.ttf"
 * before a single line of the app runs. So this is a setup step in the same
 * category as `npm install`, not a nicety.
 *
 * All three are free for commercial use. See docs/12 for why each was chosen.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["correspondent", "viewer"];
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c("32", s);
const red = (s) => c("31", s);
const dim = (s) => c("2", s);
const bold = (s) => c("1", s);

/**
 * Fraunces and JetBrains Mono come straight from the Google Fonts repository,
 * which serves the variable files over plain HTTPS. Both are SIL OFL 1.1.
 */
const DIRECT = [
  {
    name: "Fraunces.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    licence: "SIL OFL 1.1",
  },
  {
    name: "JetBrainsMono.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
    licence: "SIL OFL 1.1",
  },
];

/**
 * Switzer is distributed by Fontshare under the ITF Free Font License, as a zip.
 *
 * If their endpoint moves — it has before — the fallback below keeps you
 * unblocked rather than leaving you unable to start the app over a typeface.
 */
const SWITZER_ZIP = "https://api.fontshare.com/v2/fonts/download/switzer";
const SWITZER_FILES = ["Switzer-Regular.otf", "Switzer-Medium.otf", "Switzer-Semibold.otf"];

/**
 * The substitute, used only with --fallback.
 *
 * Archivo, not Inter. Inter is on the "looks generated" list in docs/12, and
 * Archivo was drawn for high performance at small sizes — which is the actual
 * reason Switzer was chosen, so the substitution keeps the rationale intact
 * even though it changes the face.
 */
const FALLBACK = {
  base: "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/",
  file: "Archivo%5Bwdth%2Cwght%5D.ttf",
  map: { "Switzer-Regular.otf": null, "Switzer-Medium.otf": null, "Switzer-Semibold.otf": null },
};

function has(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function download(url, into) {
  execFileSync("curl", ["-sS", "-L", "--fail", "--max-time", "120", "-o", into, url], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function fontDir(app) {
  return join(root, "apps", app, "assets", "fonts");
}

function place(name, from) {
  for (const app of APPS) {
    const dir = fontDir(app);
    mkdirSync(dir, { recursive: true });
    execFileSync("cp", [from, join(dir, name)]);
  }
}

// ---------------------------------------------------------------------------

const fallback = process.argv.includes("--fallback");

console.log("");
console.log(bold("  Fonts for the Elongo apps"));
console.log(dim(`  ${"─".repeat(66)}`));

if (!has("curl")) {
  console.error(red("\n  curl is required and was not found on PATH.\n"));
  process.exit(1);
}

const scratch = join(tmpdir(), `elongo-fonts-${process.pid}`);
mkdirSync(scratch, { recursive: true });

let failures = 0;

for (const font of DIRECT) {
  const target = join(scratch, font.name);
  try {
    download(font.url, target);
    place(font.name, target);
    console.log(`  ${green("OK")}    ${font.name.padEnd(26)}${dim(font.licence)}`);
  } catch (err) {
    failures += 1;
    console.log(`  ${red("FAIL")}  ${font.name.padEnd(26)}${dim(String(err.message).slice(0, 40))}`);
  }
}

// --- Switzer ---------------------------------------------------------------

let switzerOk = false;
if (!fallback) {
  const zip = join(scratch, "switzer.zip");
  try {
    download(SWITZER_ZIP, zip);
    if (!has("unzip")) throw new Error("unzip not found");
    execFileSync("unzip", ["-o", "-q", "-j", zip, "-d", join(scratch, "switzer")], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    for (const name of SWITZER_FILES) {
      const found = join(scratch, "switzer", name);
      if (!existsSync(found)) throw new Error(`${name} not in the archive`);
      place(name, found);
    }
    switzerOk = true;
    for (const name of SWITZER_FILES) {
      console.log(`  ${green("OK")}    ${name.padEnd(26)}${dim("ITF Free Font License")}`);
    }
  } catch (err) {
    console.log(`  ${red("FAIL")}  ${"Switzer (3 weights)".padEnd(26)}${dim(String(err.message).slice(0, 40))}`);
  }
}

if (!switzerOk) {
  // Substitute, so a moved download endpoint never stops you starting the app.
  const target = join(scratch, "Archivo.ttf");
  try {
    download(FALLBACK.base + FALLBACK.file, target);
    for (const name of Object.keys(FALLBACK.map)) place(name, target);
    console.log(`  ${green("OK")}    ${"Switzer → Archivo".padEnd(26)}${dim("SIL OFL 1.1 — substitute")}`);
    console.log(
      dim(
        "\n  Substituted Archivo for Switzer so the app will start. Switzer is the\n" +
          "  intended face (docs/12); download it from https://fontshare.com/fonts/switzer\n" +
          "  and drop the three .otf files into apps/*/assets/fonts when convenient.",
      ),
    );
  } catch (err) {
    failures += 1;
    console.log(`  ${red("FAIL")}  ${"interface face".padEnd(26)}${dim(String(err.message).slice(0, 40))}`);
  }
}

// --- attribution -----------------------------------------------------------

for (const app of APPS) {
  writeFileSync(
    join(fontDir(app), "ATTRIBUTION.txt"),
    [
      "Fonts bundled with this application",
      "",
      "Fraunces — SIL Open Font License 1.1 — https://fonts.google.com/specimen/Fraunces",
      "JetBrains Mono — SIL Open Font License 1.1 — https://www.jetbrains.com/lp/mono/",
      switzerOk
        ? "Switzer — ITF Free Font License — https://www.fontshare.com/fonts/switzer"
        : "Archivo — SIL Open Font License 1.1 — https://fonts.google.com/specimen/Archivo",
      "",
      "Both licences require this notice to travel with the binaries.",
      "",
    ].join("\n"),
  );
}

rmSync(scratch, { recursive: true, force: true });

console.log(dim(`\n  ${"─".repeat(66)}`));
if (failures === 0) {
  console.log(green(bold("  Fonts installed into both apps.")));
  console.log(dim("  They are gitignored — this is a per-clone setup step.\n"));
} else {
  console.log(red(bold(`  ${failures} font(s) could not be downloaded.`)));
  console.log(dim("  See apps/*/assets/fonts/README.md for the manual route.\n"));
  process.exit(1);
}
