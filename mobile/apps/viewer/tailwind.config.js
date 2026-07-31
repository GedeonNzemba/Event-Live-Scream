/**
 * Tailwind / NativeWind theme — viewer.
 *
 * Duplicated from `@elongo/design/src/tokens.ts` because this file is CommonJS
 * and cannot require a TypeScript module; `packages/design/test/
 * tailwind-sync.test.ts` fails if the two disagree.
 *
 * The viewer carries the light palette as well as the dark one. That asymmetry
 * is deliberate: the correspondent app is dark by product decision, because the
 * OLED saving is battery the ceremony needs (docs/01). A relative in Créteil
 * watching on a charger has no such constraint and may simply prefer light.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
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
        paper: {
          DEFAULT: "#F7F5F1",
          raised: "#FFFFFF",
          border: "#DDD8D0",
          ink: "#14212A",
          dim: "#5C6E79",
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
