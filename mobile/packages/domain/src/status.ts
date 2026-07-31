import { BUFFERED_RUNG, FLOOR_RUNG, RUNG_LABEL_FR, rung as rungAt } from "./ladder.ts";

/**
 * The honest status line.
 *
 * Per docs/02, telling people *why* the picture changed is the product.
 * "Mode économie d'énergie — 90 minutes de batterie" is a service managing a
 * known constraint; a call that dies without explanation is a failure. Same
 * physics, opposite experience. The anxiety is uncertainty, not low quality — so
 * never show a bare spinner.
 *
 * The server computes this too (`media/src/manifest.ts`) because the viewer's
 * web player has no other source of truth. The correspondent app computes it
 * locally: it *is* the source of truth, and asking the network how the network
 * is doing is not a plan. Both must say the same words, so the wording lives
 * here and the two are compared in the tests.
 */

export type StatusTone = "good" | "degraded" | "buffering" | "offline";

export type Telemetry = {
  readonly rung: number;
  readonly batteryPct: number | null;
  readonly uplinkKbps: number;
  readonly backlogSec: number;
  readonly screenOn: boolean;
};

export type StatusLine = {
  readonly rung: number;
  readonly rungName: string;
  readonly label: string;
  readonly detail: string | null;
  readonly tone: StatusTone;
};

export type SessionState = "idle" | "live" | "ended" | "complete";

function battery(t: Telemetry): string {
  return t.batteryPct === null ? "" : ` · batterie ${Math.round(t.batteryPct)} %`;
}

export function statusLine(t: Telemetry | null, state: SessionState): StatusLine {
  if (state === "complete") {
    return {
      rung: 0,
      rungName: "—",
      label: "Enregistrement complet",
      detail: "Tout est arrivé.",
      tone: "good",
    };
  }
  if (state === "ended") {
    return {
      rung: 0,
      rungName: "—",
      label: "Réception de la fin en cours…",
      detail: "L'enregistrement est terminé, le reste finit d'arriver.",
      tone: "buffering",
    };
  }
  if (!t || state === "idle") {
    return {
      rung: 0,
      rungName: "—",
      label: "En attente du correspondant…",
      detail: null,
      tone: "buffering",
    };
  }

  const name = RUNG_LABEL_FR[rungAt(t.rung).index];

  if (t.rung >= BUFFERED_RUNG) {
    return {
      rung: t.rung,
      rungName: name,
      label: "Connexion perdue — l'enregistrement continue, vous ne perdez rien",
      detail: `${Math.round(t.backlogSec)} s en attente d'envoi`,
      tone: "offline",
    };
  }
  if (t.rung >= FLOOR_RUNG) {
    return {
      rung: t.rung,
      rungName: name,
      label: `Réseau très faible — audio seul${battery(t)}`,
      detail: "La vidéo arrivera plus tard, rien n'est perdu.",
      tone: "degraded",
    };
  }
  if (rungAt(t.rung).stillIntervalSec !== null) {
    return {
      rung: t.rung,
      rungName: name,
      label: `Réseau faible — audio et photos${battery(t)}`,
      detail: "La vidéo arrivera plus tard, rien n'est perdu.",
      tone: "degraded",
    };
  }
  if (!t.screenOn && t.rung >= 3) {
    return {
      rung: t.rung,
      rungName: name,
      label: `Mode économie d'énergie — ${name}${battery(t)}`,
      detail: "L'écran est éteint pour tenir jusqu'à la fin.",
      tone: "degraded",
    };
  }
  if (t.rung >= 3) {
    return {
      rung: t.rung,
      rungName: name,
      label: `Réseau chargé — ${name}${battery(t)}`,
      detail: null,
      tone: "degraded",
    };
  }
  return {
    rung: t.rung,
    rungName: name,
    label: `Bonne connexion — ${name}${battery(t)}`,
    detail: null,
    tone: "good",
  };
}
