import "../src/global.css";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { colour, family, text } from "@elongo/design";

/**
 * Root layout.
 *
 * Unlike the correspondent app this one honours the system theme. The
 * asymmetry is deliberate: dark is a battery decision on a phone that has to
 * survive a ceremony, and the relative watching in Créteil has a charger.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5_000, refetchOnWindowFocus: true },
  },
});

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme !== "light";
  const ground = dark ? colour.ink950 : colour.paper;
  const ink = dark ? colour.ink50 : colour.paperInk;

  const [fontsLoaded] = useFonts({
    Fraunces: require("../assets/fonts/Fraunces.ttf"),
    Switzer: require("../assets/fonts/Switzer-Regular.otf"),
    "Switzer-Medium": require("../assets/fonts/Switzer-Medium.otf"),
    "Switzer-Semibold": require("../assets/fonts/Switzer-Semibold.otf"),
    JetBrainsMono: require("../assets/fonts/JetBrainsMono.ttf"),
  });

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: ground }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: ground }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: ground },
            headerTintColor: ink,
            headerTitleStyle: { fontFamily: family.display, fontSize: text.lead.fontSize },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: ground },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Elongo" }} />
          <Stack.Screen name="watch/[presenceId]" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
