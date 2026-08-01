import { Text, View } from "react-native";

/**
 * A signpost, not an app.
 *
 * `mobile/` is the workspace root. It is not an Expo project, and starting Expo
 * here is a mistake — but an easy one, because it is the directory you were just
 * in to run `npm run setup`.
 *
 * Without this file that mistake produces:
 *
 *     Unable to resolve "../../App" from "node_modules/expo/AppEntry.js"
 *
 * which is spectacularly unhelpful. Expo takes its entry point from the `main`
 * field of whatever directory it treats as the project; `mobile/package.json`
 * has none, so Expo falls back to its legacy `expo/AppEntry`, and that file
 * imports `../../App` — resolving to exactly here. The error therefore names two
 * files that have nothing to do with the problem and never mentions the one
 * thing that does: the working directory.
 *
 * So this file exists to be found. Metro resolves it, the bundle succeeds, and
 * the simulator shows the actual instruction instead of a stack trace.
 *
 * It is deliberately built from nothing but React Native primitives and inline
 * styles: no expo-router, no NativeWind, no fonts, no design tokens. A signpost
 * that can itself fail to load is worse than no signpost, and every one of those
 * dependencies is a thing that might not be installed at the moment somebody
 * ends up here.
 */

const INK = "#0B1620";
const TEXT = "#E9EDEF";
const DIM = "#9FB4BF";
const SIGNAL = "#E2913C";

export default function WrongDirectory() {
  return (
    <View style={{ flex: 1, backgroundColor: INK, padding: 28, justifyContent: "center", gap: 20 }}>
      <Text style={{ color: SIGNAL, fontSize: 12, letterSpacing: 1.5, fontWeight: "600" }}>
        MAUVAIS DOSSIER · WRONG DIRECTORY
      </Text>

      <Text style={{ color: TEXT, fontSize: 26, lineHeight: 32, fontWeight: "700" }}>
        Expo a démarré depuis {"mobile/"}
      </Text>

      <Text style={{ color: DIM, fontSize: 16, lineHeight: 24 }}>
        {"mobile/"} est la racine du monorepo, pas une application. Les deux
        applications sont dans {"apps/"}.
      </Text>

      <View style={{ backgroundColor: "#13222C", borderRadius: 12, padding: 18, gap: 10 }}>
        <Text style={{ color: DIM, fontSize: 12, letterSpacing: 1.2, fontWeight: "600" }}>
          DEPUIS mobile/
        </Text>
        <Text style={{ color: TEXT, fontFamily: "Courier", fontSize: 15 }}>npm run ios</Text>
        <Text style={{ color: DIM, fontSize: 13 }}>l'application famille · iOS</Text>
        <Text style={{ color: TEXT, fontFamily: "Courier", fontSize: 15, marginTop: 8 }}>
          npm run android
        </Text>
        <Text style={{ color: DIM, fontSize: 13 }}>l'application correspondant · Android</Text>
      </View>

      <Text style={{ color: DIM, fontSize: 14, lineHeight: 21 }}>
        Ces deux commandes vont d'elles-mêmes dans le bon dossier. À la main :
        {" "}
        <Text style={{ color: TEXT, fontFamily: "Courier" }}>cd apps/viewer</Text> puis{" "}
        <Text style={{ color: TEXT, fontFamily: "Courier" }}>npx expo run:ios</Text>.
      </Text>

      <Text style={{ color: DIM, fontSize: 14, lineHeight: 21 }}>
        Expo Go ne peut pas charger ce projet : expo-video, Skia, VisionCamera et
        expo-sqlite sont des modules natifs qu'il ne contient pas.
        {" "}
        <Text style={{ color: TEXT }}>run:ios</Text> construit un development build.
      </Text>
    </View>
  );
}
