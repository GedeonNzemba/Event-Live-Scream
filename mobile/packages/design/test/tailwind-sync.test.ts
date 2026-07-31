import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { colour, radius } from "../src/tokens.ts";

/**
 * Drift guard.
 *
 * Each app's `tailwind.config.js` is CommonJS, loaded by Tailwind's own config
 * loader, which cannot require a TypeScript module — so the palette is written
 * out by hand there. Duplication without a check is how an app quietly ends up
 * two shades off. These tests read the config as text and fail on any
 * disagreement, which costs nothing and removes the whole failure mode.
 */

const here = dirname(fileURLToPath(import.meta.url));
const APPS = ["correspondent", "viewer"];

function configOf(app: string): string {
  return readFileSync(join(here, "..", "..", "..", "apps", app, "tailwind.config.js"), "utf8");
}

for (const app of APPS) {
  test(`${app}: every colour token appears in the Tailwind theme`, () => {
    const config = configOf(app);
    for (const [name, hex] of Object.entries(colour)) {
      // Light-theme tokens are viewer-only; the correspondent app is dark by
      // decision, not by omission (docs/12).
      const lightOnly = name.startsWith("paper");
      if (lightOnly && app !== "viewer") continue;
      assert.ok(
        config.includes(hex),
        `${app}/tailwind.config.js is missing ${name} (${hex}) — the palette has drifted`,
      );
    }
  });

  test(`${app}: the Tailwind theme invents no colours of its own`, () => {
    const config = configOf(app);
    const known = new Set(Object.values(colour).map((c) => c.toUpperCase()));
    const found = config.match(/#[0-9A-Fa-f]{6}/g) ?? [];
    for (const hex of found) {
      assert.ok(
        known.has(hex.toUpperCase()),
        `${app}/tailwind.config.js uses ${hex}, which is not in the design tokens`,
      );
    }
  });

  test(`${app}: radii match the tokens`, () => {
    const config = configOf(app);
    for (const [name, value] of Object.entries(radius)) {
      if (name === "pill") continue; // expressed as rounded-full
      assert.ok(config.includes(`"${value}px"`), `${app} radius ${name} drifted from ${value}px`);
    }
  });
}
