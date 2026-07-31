import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, BatteryCharging, Check, ShieldCheck, Wifi } from "lucide-react-native";
import { colour, iconSize, minTap, space, stroke, text } from "@elongo/design";

import { MEDIA_BASE_URL } from "../src/lib/config";

/**
 * Mission screen.
 *
 * The correspondent arrives at a wedding with a phone, a reference and, on a
 * bad day, 40% battery. This screen exists to make the four things that ruin an
 * event impossible to forget — and to refuse to start until the one that is
 * non-negotiable, consent, is confirmed.
 *
 * The checklist is not decoration. Per docs/05 the correspondent is filming
 * somebody's funeral: the host's on-camera consent is what separates a service
 * from an intrusion, and it is also the answer store review will ask for.
 */

const CHECKS = [
  {
    id: "consent",
    required: true,
    Icon: ShieldCheck,
    title: "Accord de la famille",
    detail: "L'hôte sait que vous filmez et que la vidéo va à la famille à l'étranger.",
  },
  {
    id: "power",
    required: false,
    Icon: BatteryCharging,
    title: "Batterie externe branchée",
    detail: "Trois heures de cérémonie vident un téléphone. La batterie externe est dans le kit.",
  },
  {
    id: "data",
    required: false,
    Icon: Wifi,
    title: "Forfait data rechargé",
    detail: "Comptez 700 Mo pour trois heures. L'enregistrement continue même sans réseau.",
  },
] as const;

export default function MissionScreen() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [captureKey, setCaptureKey] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});

  const consentGiven = done.consent === true;
  const ready = consentGiven && reference.trim().length >= 4 && captureKey.trim().length >= 4;

  return (
    <ScrollView
      style={{ backgroundColor: colour.ink950 }}
      contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxxl, gap: space.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <Text style={[text.display, { color: colour.ink50 }]}>Nouvelle mission</Text>
        <Text style={[text.body, { color: colour.ink300, marginTop: space.sm }]}>
          Entrez la référence reçue par SMS, puis vérifiez les trois points ci-dessous.
        </Text>
      </View>

      <View style={{ gap: space.md }}>
        <Field
          label="Référence"
          value={reference}
          onChange={(v) => setReference(v.toUpperCase())}
          placeholder="EL7K2M"
          mono
          autoCapitalize="characters"
        />
        <Field
          label="Clé de capture"
          value={captureKey}
          onChange={setCaptureKey}
          placeholder="reçue avec la référence"
          mono
          secure
        />
      </View>

      <View style={{ gap: space.sm }}>
        {CHECKS.map((check) => (
          <CheckRow
            key={check.id}
            check={check}
            checked={done[check.id] === true}
            onToggle={() => setDone((d) => ({ ...d, [check.id]: !d[check.id] }))}
          />
        ))}
      </View>

      {!consentGiven ? (
        <Text style={[text.small, { color: colour.signal }]}>
          L'accord de la famille est obligatoire avant de commencer.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={() =>
          router.push({
            pathname: "/capture",
            params: { presenceId: reference.trim().toLowerCase(), key: captureKey.trim() },
          })
        }
        style={({ pressed }) => ({
          minHeight: minTap + 8,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: space.sm,
          backgroundColor: ready ? colour.signal : colour.ink800,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={[text.bodyStrong, { color: ready ? colour.ink950 : colour.ink500 }]}>
          Commencer l'enregistrement
        </Text>
        <ArrowRight size={iconSize} strokeWidth={stroke.icon} color={ready ? colour.ink950 : colour.ink500} />
      </Pressable>

      <Text style={[text.data, { color: colour.ink500 }]}>{MEDIA_BASE_URL}</Text>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  secure,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mono?: boolean;
  secure?: boolean;
  autoCapitalize?: "none" | "characters";
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[text.label, { color: colour.ink300 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colour.ink500}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize ?? "none"}
        autoCorrect={false}
        style={[
          mono ? text.dataLarge : text.body,
          {
            color: colour.ink50,
            backgroundColor: colour.ink900,
            borderWidth: 1,
            borderColor: colour.ink700,
            borderRadius: 8,
            paddingHorizontal: space.lg,
            minHeight: minTap,
          },
        ]}
      />
    </View>
  );
}

function CheckRow({
  check,
  checked,
  onToggle,
}: {
  check: (typeof CHECKS)[number];
  checked: boolean;
  onToggle: () => void;
}) {
  const { Icon } = check;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={{
        flexDirection: "row",
        gap: space.md,
        alignItems: "flex-start",
        padding: space.lg,
        borderRadius: 14,
        backgroundColor: colour.ink900,
        borderWidth: 1,
        borderColor: checked ? colour.river : colour.ink700,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: checked ? colour.river : "transparent",
          borderWidth: checked ? 0 : 1,
          borderColor: colour.ink500,
        }}
      >
        {checked ? <Check size={16} strokeWidth={2.5} color={colour.ink950} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon size={18} strokeWidth={stroke.icon} color={checked ? colour.river : colour.ink300} />
          <Text style={[text.bodyStrong, { color: colour.ink50 }]}>{check.title}</Text>
          {check.required ? (
            <Text style={[text.label, { color: colour.signal }]}>obligatoire</Text>
          ) : null}
        </View>
        <Text style={[text.small, { color: colour.ink300, marginTop: 2 }]}>{check.detail}</Text>
      </View>
    </Pressable>
  );
}
