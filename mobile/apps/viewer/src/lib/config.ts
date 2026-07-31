import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Where the media service lives.
 *
 * The default is platform-dependent and that is not a detail: an Android
 * emulator reaches the host machine at the magic address 10.0.2.2, while an iOS
 * simulator shares the host's network stack and reaches it at localhost. Using
 * one value for both means the app silently cannot talk to the server on one of
 * the two platforms, which presents as "nothing loads" rather than as a
 * configuration mistake.
 *
 * Neither default helps a *real* handset, which is on your Wi-Fi and needs your
 * machine's LAN address. Set EXPO_PUBLIC_MEDIA_URL for that — and a real
 * handset is the only configuration that proves anything, because a simulator
 * has your laptop's fibre.
 */
function defaultBaseUrl(): string {
  // A dev server host of the form "192.168.1.20:8081" tells us the LAN address
  // the phone already used to reach Metro, which is exactly the address it needs
  // for the media service too.
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (metroHost && metroHost !== "localhost" && metroHost !== "127.0.0.1") {
    return `http://${metroHost}:3100`;
  }
  return Platform.OS === "android" ? "http://10.0.2.2:3100" : "http://localhost:3100";
}

export const MEDIA_BASE_URL = process.env.EXPO_PUBLIC_MEDIA_URL ?? defaultBaseUrl();

/**
 * How often to re-fetch the manifest during a live event.
 *
 * Three seconds, not one. The viewer is deliberately seconds behind live
 * (docs/06), so a faster poll buys nothing a relative can perceive while
 * costing battery on a phone in Créteil and requests on a server in Paris.
 */
export const MANIFEST_POLL_MS = 3_000;
