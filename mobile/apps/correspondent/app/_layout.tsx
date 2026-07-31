import "../src/global.css";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { colour, family, text } from "@elongo/design";

/**
 * Root layout.
 *
 * Dark, always. The correspondent app does not offer a light theme, and that is
 * a product decision rather than an oversight: on the OLED screens these phones
 * ship with, a dark interface measurably reduces power draw, and the
 * correspondent's battery is the constraint the whole company exists to work
 * around (docs/01).
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Assume the network is hostile, because it is. Nothing here is so fresh
      // that it is worth a failed request on a village cell.
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces: require("../assets/fonts/Fraunces.ttf"),
    Switzer: require("../assets/fonts/Switzer-Regular.otf"),
    "Switzer-Medium": require("../assets/fonts/Switzer-Medium.otf"),
    "Switzer-Semibold": require("../assets/fonts/Switzer-Semibold.otf"),
    JetBrainsMono: require("../assets/fonts/JetBrainsMono.ttf"),
  });

  // No spinner. A blank ground for a few hundred milliseconds is calmer than a
  // spinner, and the rule in this product is that a spinner is never the whole
  // message.
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colour.ink950 }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colour.ink950 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colour.ink950 },
            headerTintColor: colour.ink50,
            headerTitleStyle: { fontFamily: family.display, fontSize: text.lead.fontSize },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colour.ink950 },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Elongo" }} />
          <Stack.Screen
            name="capture"
            options={{ title: "Enregistrement", headerShown: false, gestureEnabled: false }}
          />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
