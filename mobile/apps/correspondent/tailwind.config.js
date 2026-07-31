/**
 * Tailwind / NativeWind theme.
 *
 * The palette is duplicated from `@elongo/design/src/tokens.ts` rather than
 * imported: this file is CommonJS, loaded by Tailwind's own config loader,
 * which cannot require a TypeScript module. Duplication is a drift risk, so
 * `packages/design/test/tailwind-sync.test.ts` reads this file and fails if any
 * token here disagrees with the source of truth.
 *
 * Add a colour there first, then here.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1620",
          900: "#13222C",
          800: "#1B2E3B",
          700: "#24394A",
          500: "#54707F",
          300: "#9FB4BF",
          50: "#E9EDEF",
        },
        signal: { DEFAULT: "#E2913C", dim: "#8A5A24" },
        river: { DEFAULT: "#2E9A94", dim: "#1C5F5C" },
        brick: { DEFAULT: "#C4564A", dim: "#7A342D" },
        sand: "#D9C9A8",
      },
      borderRadius: {
        control: "8px",
        surface: "14px",
        sheet: "22px",
      },
      fontFamily: {
        display: ["Fraunces"],
        sans: ["Switzer"],
        medium: ["Switzer-Medium"],
        semibold: ["Switzer-Semibold"],
        mono: ["JetBrainsMono"],
      },
    },
  },
  plugins: [],
};
