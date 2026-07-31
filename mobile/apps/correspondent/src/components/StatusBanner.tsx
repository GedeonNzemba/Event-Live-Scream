import { Text, View } from "react-native";
import { BatteryLow, CloudOff, Signal, SignalLow, Wifi } from "lucide-react-native";
import { colour, iconSize, stroke, text, tone as toneColour } from "@elongo/design";
import type { StatusLine } from "@elongo/domain";

/**
 * The honest status line.
 *
 * Per docs/02 this *is* the product: telling the family why the picture changed
 * turns the same physics into the opposite experience. "Mode économie
 * d'énergie — 90 minutes de batterie" is a service managing a known constraint;
 * a call that dies without explanation is a failure.
 *
 * The rule this component exists to enforce: **never a bare spinner.** The
 * customer's anxiety is uncertainty, not low quality. Every state below has
 * words.
 */

const ICONS = {
  good: Wifi,
  degraded: SignalLow,
  buffering: Signal,
  offline: CloudOff,
} as const;

export function StatusBanner({ status, batteryPct }: { status: StatusLine; batteryPct?: number | null }) {
  const Icon = ICONS[status.tone];
  const accent = toneColour[status.tone];
  const lowBattery = typeof batteryPct === "number" && batteryPct <= 15;

  return (
    <View
      className="flex-row items-start gap-md rounded-surface border px-lg py-md"
      style={{ borderColor: `${accent}44`, backgroundColor: `${accent}14` }}
    >
      <Icon size={iconSize} strokeWidth={stroke.icon} color={accent} />
      <View className="flex-1">
        <Text style={[text.bodyStrong, { color: colour.ink50 }]}>{status.label}</Text>
        {status.detail ? (
          <Text style={[text.small, { color: colour.ink300, marginTop: 2 }]}>{status.detail}</Text>
        ) : null}
      </View>
      {lowBattery ? <BatteryLow size={iconSize} strokeWidth={stroke.icon} color={colour.brick} /> : null}
    </View>
  );
}
