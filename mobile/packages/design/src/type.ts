/**
 * Typography.
 *
 * Three faces, each doing a distinct job, all free for commercial use:
 *
 *   Fraunces        display — a variable old-style serif with optical sizing.
 *                   Warm and high-contrast, carries the gravity a *matanga*
 *                   deserves without looking funereal. SIL OFL.
 *   Switzer         interface — Swiss neo-grotesque, genuinely good at small
 *                   sizes on cheap Android screens. ITF Free Font License.
 *   JetBrains Mono  data — timecodes, battery, bitrate, references. Tabular
 *                   figures and an unambiguous 0/O, which matters when a
 *                   reference is read aloud down a bad line. SIL OFL.
 *
 * Deliberately not Inter, and deliberately not Space Grotesk: they are what
 * every generated interface currently uses, and this product is asking families
 * to trust it with a funeral.
 *
 * Load with expo-font, subset to Latin Extended, ship the variable version —
 * one file each, and the correspondent is paying for their own download.
 */

export const family = {
  display: "Fraunces",
  ui: "Switzer",
  uiMedium: "Switzer-Medium",
  uiSemibold: "Switzer-Semibold",
  data: "JetBrainsMono",
} as const;

/** The font files each app registers with expo-font. Keys are the names above. */
export const fontAssets = {
  Fraunces: "Fraunces[SOFT,WONK,opsz,wght].ttf",
  Switzer: "Switzer-Regular.otf",
  "Switzer-Medium": "Switzer-Medium.otf",
  "Switzer-Semibold": "Switzer-Semibold.otf",
  JetBrainsMono: "JetBrainsMono[wght].ttf",
} as const;

/** 12 / 14 / 16 / 20 / 26 / 34 / 44. Body at 16, never below 14. */
export const size = {
  micro: 12,
  small: 14,
  body: 16,
  lead: 20,
  title: 26,
  display: 34,
  hero: 44,
} as const;

export type TextStyle = {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly textTransform?: "uppercase";
};

function ui(fontSize: number, fontFamily: string, ratio = 1.5, letterSpacing = 0): TextStyle {
  return {
    fontFamily,
    fontSize,
    lineHeight: Math.round(fontSize * ratio),
    letterSpacing,
  };
}

export const text = {
  /** Display gets tight tracking; at hero sizes default tracking looks slack. */
  hero: ui(size.hero, family.display, 1.1, -0.02 * size.hero),
  display: ui(size.display, family.display, 1.15, -0.02 * size.display),
  title: ui(size.title, family.display, 1.25, -0.01 * size.title),
  lead: ui(size.lead, family.uiMedium, 1.4),
  body: ui(size.body, family.ui, 1.5),
  bodyStrong: ui(size.body, family.uiSemibold, 1.5),
  small: ui(size.small, family.ui, 1.45),
  /** Uppercase labels get +0.12em, otherwise they set as a solid block. */
  label: { ...ui(size.micro, family.uiSemibold, 1.3, 0.12 * size.micro), textTransform: "uppercase" as const },
  /** Anything a person might read aloud or compare digit by digit. */
  data: ui(size.small, family.data, 1.35),
  dataLarge: ui(size.lead, family.data, 1.3),
} satisfies Record<string, TextStyle>;
