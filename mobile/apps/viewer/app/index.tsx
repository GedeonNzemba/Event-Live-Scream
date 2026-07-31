import { useState } from "react";
import { Pressable, Text, TextInput, View, useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import { PlayCircle } from "lucide-react-native";
import { colour, iconSize, minTap, space, stroke, text } from "@elongo/design";

/**
 * The front door.
 *
 * In practice almost nobody types anything here: the family arrives by tapping
 * a link in a WhatsApp group, which opens straight into the watch screen via a
 * universal link (docs/09). This screen is the fallback for the relative who
 * installed the app first and is now looking for the wedding — and for testing.
 */
export default function HomeScreen() {
  const router = useRouter();
  const dark = useColorScheme() !== "light";
  const [reference, setReference] = useState("");
  const [token, setToken] = useState("");

  const ink = dark ? colour.ink50 : colour.paperInk;
  const dim = dark ? colour.ink300 : colour.paperInkDim;
  const surface = dark ? colour.ink900 : colour.paperRaised;
  const border = dark ? colour.ink700 : colour.paperBorder;
  const ready = reference.trim().length >= 4 && token.trim().length > 0;

  return (
    <View style={{ flex: 1, padding: space.xl, gap: space.xl }}>
      <View>
        <Text style={[text.display, { color: ink }]}>Suivre un événement</Text>
        <Text style={[text.body, { color: dim, marginTop: space.sm }]}>
          Ouvrez le lien reçu de la famille, ou entrez la référence et le code ci-dessous.
        </Text>
      </View>

      {[
        { label: "Référence", value: reference, set: setReference, placeholder: "EL7K2M" },
        { label: "Code d'accès", value: token, set: setToken, placeholder: "reçu avec le lien" },
      ].map((field) => (
        <View key={field.label} style={{ gap: space.xs }}>
          <Text style={[text.label, { color: dim }]}>{field.label}</Text>
          <TextInput
            value={field.value}
            onChangeText={field.set}
            placeholder={field.placeholder}
            placeholderTextColor={dark ? colour.ink500 : colour.paperInkDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              text.dataLarge,
              {
                color: ink,
                backgroundColor: surface,
                borderWidth: 1,
                borderColor: border,
                borderRadius: 8,
                paddingHorizontal: space.lg,
                minHeight: minTap,
              },
            ]}
          />
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        disabled={!ready}
        onPress={() =>
          router.push({
            pathname: "/watch/[presenceId]",
            params: { presenceId: reference.trim().toLowerCase(), t: token.trim() },
          })
        }
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          minHeight: minTap + 8,
          borderRadius: 8,
          backgroundColor: ready ? colour.signal : dark ? colour.ink800 : colour.paperBorder,
        }}
      >
        <PlayCircle size={iconSize} strokeWidth={stroke.icon} color={ready ? colour.ink950 : dim} />
        <Text style={[text.bodyStrong, { color: ready ? colour.ink950 : dim }]}>Regarder</Text>
      </Pressable>
    </View>
  );
}
