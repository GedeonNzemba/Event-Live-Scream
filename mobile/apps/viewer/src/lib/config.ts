import Constants from "expo-constants";

export const MEDIA_BASE_URL =
  process.env.EXPO_PUBLIC_MEDIA_URL ??
  (Constants.expoConfig?.extra?.mediaBaseUrl as string | undefined) ??
  "http://10.0.2.2:3100";

/**
 * How often to re-fetch the manifest during a live event.
 *
 * Three seconds, not one. The viewer is deliberately seconds behind live
 * (docs/06), so a faster poll buys nothing a relative can perceive while
 * costing battery on a phone in Créteil and requests on a server in Paris.
 */
export const MANIFEST_POLL_MS = 3_000;
