/**
 * @elongo/api — the typed client both apps talk to the server through.
 *
 * WHAT IS NOT HERE, AND WHY. The booking and family-pool service in `app/` is
 * server-rendered HTML with form posts. That was the right call for a service
 * whose whole job is to be openable from a WhatsApp link on any phone, but it
 * means there is no JSON surface for the viewer app to consume yet. Adding one
 * is a prerequisite for the viewer's pool screens, and it is listed as such in
 * `mobile/README.md` rather than being quietly stubbed here.
 */

export { MediaClient, type Fetchish, type MediaClientOptions } from "./media-client.ts";
export {
  ApiError,
  DEFAULT_RETRY,
  backoffMs,
  classify,
  retriableStatus,
  type FailureKind,
  type RetryPolicy,
} from "./retry.ts";
export type {
  Completeness,
  IngestStatus,
  Manifest,
  PresenceState,
  PutOutcome,
  SegmentRef,
  StatusLine,
  Telemetry,
  Track,
} from "./types.ts";
