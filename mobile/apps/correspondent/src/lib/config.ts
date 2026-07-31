import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Where the media service lives.
 *
 * The default is platform-dependent and that is not a detail: an Android
 * emulator reaches the host machine at the magic address 10.0.2.2, while an iOS
 * simulator shares the host's network stack and reaches it at localhost. Using
 * one value for both means the app silently cannot talk to the server on one of
 * the two platforms, which presents as "nothing uploads" rather than as a
 * configuration mistake — and on this app in particular that is indistinguishable
 * from the outage behaviour it is designed to survive.
 *
 * Neither default helps a *real* handset, which is on your Wi-Fi and needs your
 * machine's LAN address. Set EXPO_PUBLIC_MEDIA_URL for that — and a real
 * handset is the only configuration that proves anything, because an emulator
 * has your laptop's fibre and mains power.
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

/** How far behind live watch mode deliberately runs (docs/06). */
export const LIVE_WINDOW_SEC = 15;

/** Segment length. Shorter recovers faster; longer compresses better. */
export const SEGMENT_SEC = 2;

/** Typical usable battery for the handsets correspondents actually own. */
export const DEFAULT_CAPACITY_WH = 15.4;
