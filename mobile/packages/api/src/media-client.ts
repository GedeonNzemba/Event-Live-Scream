import { ApiError, DEFAULT_RETRY, backoffMs, retriableStatus, type RetryPolicy } from "./retry.ts";
import type {
  IngestStatus,
  Manifest,
  PutOutcome,
  Telemetry,
  Track,
} from "./types.ts";

/**
 * The media client.
 *
 * `fetch` and `sleep` are injected. That is not ceremony: the interesting
 * behaviour of this class is what it does when the network misbehaves, and
 * injecting both means every one of those paths is exercised by
 * `test/api.test.ts` in milliseconds instead of being discovered at a funeral.
 *
 * Two audiences, deliberately separated, matching the server:
 *   ingest    the correspondent's phone. Per-Presence capture key. Writes only.
 *   playback  the family. Signed, expiring viewer token. Reads only.
 */

export type Fetchish = (url: string, init?: RequestInit) => Promise<Response>;

export type MediaClientOptions = {
  readonly baseUrl: string;
  readonly fetch?: Fetchish;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly retry?: Partial<RetryPolicy>;
  /** Per-attempt deadline. A stalled socket must not hold the queue forever. */
  readonly timeoutMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MediaClient {
  private readonly baseUrl: string;
  private readonly doFetch: Fetchish;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retry: RetryPolicy;
  private readonly timeoutMs: number;

  constructor(options: MediaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.doFetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  // ------------------------------------------------------------- transport --

  /**
   * One attempt, with a deadline.
   *
   * A stalled socket is worse than a refused one: a half-open TCP connection on
   * a cell that has gone away can hang for minutes, and while it hangs the
   * upload queue behind it is frozen. The timeout converts that into an
   * ordinary network failure, which the retry loop already knows how to
   * survive.
   */
  private async once(path: string, init: RequestInit): Promise<Response> {
    if (!this.timeoutMs || this.timeoutMs === Number.POSITIVE_INFINITY) {
      return this.doFetch(`${this.baseUrl}${path}`, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.doFetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async attempt(path: string, init: RequestInit): Promise<Response> {
    let attempt = 0;
    let lastStatus: number | null = null;
    let lastMessage = "request failed";

    for (;;) {
      try {
        const response = await this.once(path, init);
        if (response.ok) return response;
        lastStatus = response.status;
        lastMessage = `${init.method ?? "GET"} ${path} → ${response.status}`;
        if (!retriableStatus(response.status)) {
          throw new ApiError(lastMessage, response.status, attempt + 1);
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        // No response at all. The bytes are still on disk; this is survivable.
        lastStatus = null;
        lastMessage = err instanceof Error ? err.message : "network error";
      }

      attempt += 1;
      if (attempt >= this.retry.maxAttempts) {
        throw new ApiError(lastMessage, lastStatus, attempt);
      }
      await this.sleep(backoffMs(attempt - 1, this.retry));
    }
  }

  private async json<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.attempt(path, init);
    return (await response.json()) as T;
  }

  private captureHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
    return { "x-elongo-key": key, ...extra };
  }

  // ---------------------------------------------------------------- ingest --

  async open(
    presenceId: string,
    key: string,
    mimeType: { v: string | null; a: string | null },
  ): Promise<{ state: string }> {
    return this.json(`/ingest/${presenceId}/open`, {
      method: "POST",
      headers: this.captureHeaders(key, { "content-type": "application/json" }),
      body: JSON.stringify({ mimeType }),
    });
  }

  /**
   * Upload one segment.
   *
   * Idempotent by construction, which is the single most important property on
   * this whole surface. On a Congolese uplink the normal failure is *ambiguous*
   * — the request went out, the answer never came back — so the client cannot
   * know whether to resend. Content addressing makes that question irrelevant:
   * the same (track, seq, sha256) is the same segment, and a resend returns
   * `duplicate` instead of corrupting the archive.
   *
   * A 409 means the same sequence number arrived earlier with *different*
   * bytes. That is a client bug, not a network event, so it does not retry.
   */
  async putSegment(args: {
    presenceId: string;
    key: string;
    track: Track;
    seq: number;
    capturedAt: number;
    coversSec: number;
    rung: number;
    sha256?: string | null;
    body: ArrayBuffer | Uint8Array | Blob;
  }): Promise<PutOutcome> {
    const headers = this.captureHeaders(args.key, {
      "content-type": "application/octet-stream",
      "x-captured-at": String(args.capturedAt),
      "x-covers-sec": String(args.coversSec),
      "x-rung": String(args.rung),
    });
    if (args.sha256) headers["x-segment-sha256"] = args.sha256;

    const result = await this.json<{ status: PutOutcome }>(
      `/ingest/${args.presenceId}/${args.track}/${args.seq}`,
      { method: "PUT", headers, body: args.body as BodyInit },
    );
    return result.status;
  }

  /** Heartbeat. Carries the honest status line to everyone watching. */
  async progress(
    presenceId: string,
    key: string,
    capturedThroughSec: number,
    telemetry: Telemetry,
  ): Promise<void> {
    await this.json(`/ingest/${presenceId}/progress`, {
      method: "POST",
      headers: this.captureHeaders(key, { "content-type": "application/json" }),
      body: JSON.stringify({ capturedThroughSec, telemetry }),
    });
  }

  /**
   * Reconciliation.
   *
   * After an outage the client asks what actually arrived and re-sends only the
   * difference. Without this it either re-uploads the whole event — wasting a
   * data bundle somebody paid cash for — or assumes success and silently loses
   * the part that failed.
   */
  async status(presenceId: string, key: string): Promise<IngestStatus> {
    return this.json(`/ingest/${presenceId}/status`, {
      method: "GET",
      headers: this.captureHeaders(key),
    });
  }

  /**
   * End the capture.
   *
   * Called *after* the recorders stop and *before* the queue has drained: the
   * presence moves to `ended`, and the server flips it to `complete` when the
   * last segment lands. The web client shipped with this call accidentally
   * dropped, which left every event marked live forever.
   */
  async close(presenceId: string, key: string): Promise<{ state: string }> {
    return this.json(`/ingest/${presenceId}/close`, {
      method: "POST",
      headers: this.captureHeaders(key),
    });
  }

  // -------------------------------------------------------------- playback --

  async manifest(presenceId: string, token: string): Promise<Manifest> {
    return this.json(`/media/${presenceId}/manifest.json?t=${encodeURIComponent(token)}`, {
      method: "GET",
    });
  }

  /**
   * A segment's absolute URL.
   *
   * Returned rather than fetched because expo-video and the download manager
   * both want a URL, not bytes. Segments are immutable once written, so these
   * cache hard — which is what makes a CDN cheap in front of them.
   */
  segmentUrl(presenceId: string, track: Track, seq: number, token: string): string {
    return `${this.baseUrl}/media/${presenceId}/${track}/${seq}?t=${encodeURIComponent(token)}`;
  }

  async segment(presenceId: string, track: Track, seq: number, token: string): Promise<ArrayBuffer> {
    const response = await this.attempt(
      `/media/${presenceId}/${track}/${seq}?t=${encodeURIComponent(token)}`,
      { method: "GET" },
    );
    return await response.arrayBuffer();
  }
}
