/**
 * Design tokens.
 *
 * Dark by default, and that is a product decision rather than a fashion: on an
 * OLED screen a dark interface measurably reduces power draw, and the
 * correspondent's battery is the constraint the whole company exists to work
 * around (docs/01). The viewer app offers light as a preference; the
 * correspondent app does not.
 *
 * Neutrals carry a slight teal bias so they read as chosen rather than
 * inherited. Semantic colours (river / brick) are separate from the accent and
 * are never used decoratively.
 */

export const colour = {
  ink950: "#0B1620", // ground
  ink900: "#13222C", // raised surface
  ink800: "#1B2E3B", // pressed / hover
  ink700: "#24394A", // borders
  ink500: "#54707F", // disabled
  ink300: "#9FB4BF", // secondary text
  ink50: "#E9EDEF", // primary text on dark

  signal: "#E2913C", // marigold — live, attention, the accent
  signalDim: "#8A5A24",
  river: "#2E9A94", // teal — delivered, complete, good
  riverDim: "#1C5F5C",
  brick: "#C4564A", // loss — outage, refund, error
  brickDim: "#7A342D",
  sand: "#D9C9A8", // warm neutral, keepsake surfaces only

  // Light theme, viewer app only.
  paper: "#F7F5F1",
  paperRaised: "#FFFFFF",
  paperBorder: "#DDD8D0",
  paperInk: "#14212A",
  paperInkDim: "#5C6E79",
} as const;

/**
 * The status tones from @elongo/domain, given colour.
 *
 * One mapping, used by the correspondent's live badge, the viewer's status line
 * and the scrubber's gap markers — so "offline" is the same red in all three.
 */
export const tone = {
  good: colour.river,
  degraded: colour.signal,
  buffering: colour.ink300,
  offline: colour.brick,
} as const;

export type Tone = keyof typeof tone;

/**
 * Colour per ladder rung, for the ladder graphic.
 *
 * Deliberately not a smooth gradient: the reason to look at the ladder is to
 * find the moment something changed, and eight discrete steps make that
 * findable in a way a ramp does not.
 */
export const rungColour: readonly string[] = [
  colour.river, // 720p
  colour.river,
  colour.riverDim, // 360p
  colour.signal, // 240p
  colour.signal,
  colour.signalDim, // photos
  colour.brickDim, // audio only
  colour.brick, // buffered — the outage
];

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Radii, deliberately not all equal.
 *
 * "Every corner at the same rounded-lg" is on the list of things that make an
 * interface look generated. Controls are tighter than surfaces; the capture
 * button is a circle.
 */
export const radius = {
  control: 8,
  surface: 14,
  sheet: 22,
  pill: 999,
} as const;

export const stroke = {
  hairline: 1,
  icon: 1.75, // Lucide, per docs/12
  ladder: 3,
} as const;

export const iconSize = 22;

/** Android's minimum comfortable tap target; a correspondent is holding a phone one-handed. */
export const minTap = 48;

export const duration = {
  /** The ladder is the only continuously animated thing in either app. */
  ladder: 420,
  press: 90,
  screen: 260,
} as const;
