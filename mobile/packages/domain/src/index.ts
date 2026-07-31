/**
 * @elongo/domain — the logic both apps share and neither platform owns.
 *
 * No React, no React Native, no Node built-ins. That is the point: everything
 * here runs under `node --test` in milliseconds, so the rules that took a month
 * of bugs to learn are held in place by tests rather than by memory.
 */

export {
  BUFFERED_RUNG,
  FLOOR_RUNG,
  LADDER,
  RUNG_LABEL_FR,
  rung,
  type Rung,
} from "./ladder.ts";

export { LadderController, type ControllerInput } from "./controller.ts";

export {
  advise,
  drawWatts,
  hoursRemaining,
  type PowerAdvice,
  type PowerState,
} from "./power.ts";

export {
  PRIORITY,
  eligible,
  isLive,
  liveBacklogSec,
  missing,
  pendingBytes,
  priorityOf,
  sendOrder,
  type PendingSegment,
  type Track,
} from "./segments.ts";

export { statusLine, type SessionState, type StatusLine, type StatusTone, type Telemetry } from "./status.ts";

export {
  CaptureEngine,
  type Clock,
  type EngineOptions,
  type EngineStore,
  type EngineTick,
  type EngineTransport,
  type ProgressUpdate,
} from "./engine.ts";
