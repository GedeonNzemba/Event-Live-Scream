/**
 * @elongo/design — tokens, type scale, French formatting, ladder geometry.
 *
 * No React and no Skia: this package describes the design rather than rendering
 * it, so every rule in it is testable under `node --test`. The components that
 * consume it live in each app, built on NativeWind v4 and React Native
 * Reusables (docs/12) — unstyled primitives we own, rather than a component kit
 * with a visible house style.
 */

export { colour, duration, iconSize, minTap, radius, rungColour, space, stroke, tone, type Tone } from "./tokens.ts";
export { family, fontAssets, size, text, type TextStyle } from "./type.ts";
export {
  BUFFERED_RUNG_INDEX,
  RUNG_COUNT,
  barHeight,
  colourForRung,
  ladderGeometry,
  rungAtSec,
  type LadderBar,
  type LadderGeometry,
  type LadderOptions,
  type LadderSample,
} from "./ladder-geometry.ts";
export { bitrate, dataSize, humanDuration, money, percent, timecode } from "./format.ts";
