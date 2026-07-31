import { Canvas, Rect, RoundedRect } from "@shopify/react-native-skia";
import { colour, ladderGeometry, type LadderSample } from "@elongo/design";
import { View } from "react-native";

/**
 * The signal ladder.
 *
 * The product's one distinctive visual, and the only continuously animated
 * thing in either app. All of the arithmetic lives in `@elongo/design` and is
 * unit-tested there; this component does nothing but hand shapes to Skia, which
 * is deliberate — the part that can be wrong should not require a device to
 * check.
 *
 * Outage markers are drawn *above* the bars rather than instead of them,
 * because "the phone told us it was offline" and "we never heard from the
 * phone" are different facts and a viewer is entitled to tell them apart.
 */

export type SignalLadderProps = {
  readonly samples: readonly LadderSample[];
  readonly width: number;
  readonly height?: number;
  readonly durationSec?: number;
  /** Live capture uses a coarser pitch so the current rung reads at a glance. */
  readonly barPitch?: number;
};

export function SignalLadder({
  samples,
  width,
  height = 44,
  durationSec,
  barPitch = 6,
}: SignalLadderProps) {
  const geometry = ladderGeometry(samples, { width, height, durationSec, barPitch });

  return (
    <View style={{ width, height }}>
      <Canvas style={{ width, height }}>
        {geometry.outages.map((outage) => (
          <Rect
            key={`outage-${outage.fromSec}`}
            x={outage.x}
            y={0}
            width={outage.width}
            height={height}
            color={colour.brick}
            opacity={0.14}
          />
        ))}
        {geometry.bars.map((bar) => (
          <RoundedRect
            key={`bar-${bar.x}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            r={1}
            color={bar.colour}
          />
        ))}
      </Canvas>
    </View>
  );
}
