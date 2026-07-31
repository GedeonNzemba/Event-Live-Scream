import Constants from "expo-constants";

/**
 * Where the media service lives.
 *
 * `10.0.2.2` is the host machine as seen from an Android emulator. On a real
 * handset — which is the only configuration that proves anything, because the
 * emulator has your laptop's fibre — set EXPO_PUBLIC_MEDIA_URL to your
 * machine's LAN address before starting the dev server.
 */
export const MEDIA_BASE_URL =
  process.env.EXPO_PUBLIC_MEDIA_URL ??
  (Constants.expoConfig?.extra?.mediaBaseUrl as string | undefined) ??
  "http://10.0.2.2:3100";

/** How far behind live watch mode deliberately runs (docs/06). */
export const LIVE_WINDOW_SEC = 15;

/** Segment length. Shorter recovers faster; longer compresses better. */
export const SEGMENT_SEC = 2;

/** Typical usable battery for the handsets correspondents actually own. */
export const DEFAULT_CAPACITY_WH = 15.4;
