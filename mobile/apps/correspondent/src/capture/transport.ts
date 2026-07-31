import * as FileSystem from "expo-file-system";
import { MediaClient } from "@elongo/api";
import { RUNG_LABEL_FR, type EngineTransport, type PendingSegment, type Rung, type StatusLine } from "@elongo/domain";

import type { SqliteSegmentStore } from "./store.ts";

/**
 * The engine's transport, wired to the real media service.
 *
 * Reads each segment from disk at send time rather than holding it: a three-
 * hour event is a gigabyte, and the phones this runs on have 2 GB of RAM
 * shared with WhatsApp.
 *
 * NOTE ON BACKGROUND UPLOADS. This implementation uses `fetch`, which stops
 * when Android suspends the app. That is survivable during capture — the app is
 * foregrounded with a foreground service, because the correspondent is holding
 * the phone and pointing it — but it is *not* survivable for the post-event
 * drain, when the app is backgrounded with a large backlog. That path needs
 * `react-native-background-upload`, which wraps a real upload service. It is
 * listed as an open item in `mobile/README.md` rather than pretended away here.
 */
export class MediaTransport implements EngineTransport {
  private readonly client: MediaClient;
  private readonly store: SqliteSegmentStore;
  private readonly presenceId: string;
  private readonly key: string;

  constructor(args: { baseUrl: string; presenceId: string; key: string; store: SqliteSegmentStore }) {
    this.client = new MediaClient({
      baseUrl: args.baseUrl,
      // One attempt per call: the engine owns retry scheduling, because it is
      // the only thing that knows whether this segment is still worth sending
      // before the newer one behind it.
      retry: { maxAttempts: 1 },
      timeoutMs: 20_000,
    });
    this.store = args.store;
    this.presenceId = args.presenceId;
    this.key = args.key;
  }

  async send(segment: PendingSegment): Promise<void> {
    const stored = this.store.pending().find((s) => s.track === segment.track && s.seq === segment.seq);
    if (!stored) return; // acknowledged underneath us; nothing to do

    const base64 = await FileSystem.readAsStringAsync(stored.path, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = decodeBase64(base64);

    await this.client.putSegment({
      presenceId: this.presenceId,
      key: this.key,
      track: segment.track,
      seq: segment.seq,
      capturedAt: segment.capturedAt,
      coversSec: stored.coversSec,
      rung: segment.rung,
      sha256: stored.sha256,
      body: bytes,
    });
  }

  async status() {
    const result = await this.client.status(this.presenceId, this.key);
    return { received: result.received };
  }

  async progress(capturedThroughSec: number, rung: Rung, status: StatusLine): Promise<void> {
    await this.client.progress(this.presenceId, this.key, capturedThroughSec, {
      rung: rung.index,
      rungName: RUNG_LABEL_FR[rung.index],
      batteryPct: status.rung === 0 ? null : null,
      uplinkKbps: 0,
      backlogSec: 0,
      screenOn: true,
    });
  }

  open(mimeType: { v: string | null; a: string | null }) {
    return this.client.open(this.presenceId, this.key, mimeType);
  }

  close() {
    return this.client.close(this.presenceId, this.key);
  }
}

function decodeBase64(input: string): Uint8Array {
  const binary = globalThis.atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
