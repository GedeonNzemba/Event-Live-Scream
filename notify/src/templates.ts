/**
 * WhatsApp message templates.
 *
 * These are written to be registered with Meta as-is: a name, a language, and
 * positional `{{1}}` parameters, which is exactly what the Cloud API expects.
 * Keeping the French text here rather than inline at each call site means the
 * wording can be reviewed by somebody who actually speaks to these families,
 * without touching any application code.
 *
 * ── The cost model, which is not what people expect ────────────────────────
 *
 * Meta made *service* conversations free when the customer messages first.
 * In this business they always do: booking starts with them sending a message.
 * So the free tier covers the entire conversational surface, and we pay only
 * for the proactive nudges — confirmations, reminders, the delivery notice.
 *
 * Every template below is therefore marked `utility` (we pay) or `service`
 * (free, only valid inside the 24-hour window after the customer wrote to us).
 * Sending a `service` template outside that window silently fails at Meta, so
 * the outbox refuses it rather than pretending it went.
 */

export type Category = "utility" | "service" | "marketing";
export type Audience = "diaspora" | "correspondent";

export type Template = {
  readonly name: string;
  readonly category: Category;
  readonly audience: Audience;
  readonly language: "fr";
  /** What each {{n}} means, in order. Documentation, and validated at send. */
  readonly params: readonly string[];
  /** The body as registered with Meta. */
  readonly body: string;
  /** Why this message exists at all. */
  readonly purpose: string;
};

export const TEMPLATES = {
  // ---- diaspora ----------------------------------------------------------

  pool_created: {
    name: "pool_created",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["prénom", "événement", "montant", "lien"],
    body:
      "Bonjour {{1}}, votre cagnotte pour *{{2}}* est ouverte.\n\n" +
      "Objectif : {{3}}. Partagez ce lien dans le groupe de famille, " +
      "chacun participe comme il peut :\n{{4}}\n\n" +
      "Rien n'est débité tant que la cagnotte n'est pas clôturée.",
    purpose: "Gives the booker the shareable link, which is the entire growth engine.",
  },

  pool_contribution: {
    name: "pool_contribution",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["participant", "montant", "événement", "restant"],
    body:
      "{{1}} vient de participer ({{2}}) pour *{{3}}*.\n\n" +
      "Il reste {{4}} à réunir.",
    purpose:
      "Social proof at the moment it works hardest. A relative seeing that a cousin " +
      "already gave is the single strongest nudge available.",
  },

  pool_funded: {
    name: "pool_funded",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["événement", "nombre"],
    body:
      "Objectif atteint pour *{{1}}* — {{2}} personnes ont participé.\n\n" +
      "Un correspondant sera sur place. Vous recevrez le lien le jour même.",
    purpose: "Closes the loop, and tells everyone their money did something.",
  },

  shortfall_charged: {
    name: "shortfall_charged",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["prénom", "événement", "montant"],
    body:
      "Bonjour {{1}}, la cagnotte pour *{{2}}* n'était pas complète à la clôture.\n\n" +
      "Comme convenu à la création, le complément de {{3}} a été débité sur votre carte. " +
      "L'événement est confirmé — il n'est jamais annulé parce qu'il manque une participation.",
    purpose:
      "The shortfall rule must never be a surprise. Saying it plainly, immediately, " +
      "is the difference between a business rule and a grievance.",
  },

  event_tomorrow: {
    name: "event_tomorrow",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["événement", "heure", "correspondant"],
    body:
      "*{{1}}* c'est demain à {{2}} (heure de Brazzaville).\n\n" +
      "{{3}} sera sur place avec la caméra. Vous recevrez le lien juste avant le début.",
    purpose: "Lets a family across five time zones plan to be free.",
  },

  event_starting: {
    name: "event_starting",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["événement", "lien"],
    body: "*{{1}}* commence maintenant.\n\nRegardez ici :\n{{2}}",
    purpose:
      "The most important message this company sends. A one-time event four time " +
      "zones away is missed entirely if this arrives late — which is exactly why " +
      "docs/09 puts push notifications above every other client feature.",
  },

  recording_ready: {
    name: "recording_ready",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["événement", "durée", "lien"],
    body:
      "L'enregistrement complet de *{{1}}* est prêt — {{2}}.\n\n" +
      "Vous pouvez le revoir, le partager avec la famille, ou le télécharger :\n{{3}}",
    purpose:
      "The archive is the product (docs/02). This message is where the promise is " +
      "kept, and it is the one that earns the next booking.",
  },

  recording_delayed: {
    name: "recording_delayed",
    category: "utility",
    audience: "diaspora",
    language: "fr",
    params: ["événement", "pourcentage"],
    body:
      "Le réseau a coupé pendant *{{1}}*. Le correspondant a continué de filmer : " +
      "{{2}} nous est déjà parvenu et le reste arrive dès que la connexion le permet.\n\n" +
      "Vous aurez la totalité — c'est enregistré sur place, rien n'est perdu.",
    purpose:
      "Sent before the family notices something is missing. Uncertainty is the " +
      "anxiety, not delay — so we say it first rather than waiting to be asked.",
  },

  // ---- correspondent -----------------------------------------------------

  gig_offer: {
    name: "gig_offer",
    category: "utility",
    audience: "correspondent",
    language: "fr",
    params: ["prénom", "date", "heure", "quartier", "rémunération"],
    body:
      "Bonjour {{1}}, nouvelle mission Elongo.\n\n" +
      "{{2}} à {{3}}, {{4}}.\n" +
      "Rémunération : {{5}}, payée le jour même par Mobile Money.\n" +
      "Le forfait data est payé par Elongo.\n\n" +
      "Répondez OUI pour accepter.",
    purpose:
      "Says the fee and that we pay the data, both up front. A correspondent who " +
      "ever pays for their own bundle stops answering, and nobody files a complaint.",
  },

  gig_reminder: {
    name: "gig_reminder",
    category: "utility",
    audience: "correspondent",
    language: "fr",
    params: ["heure", "quartier"],
    body:
      "Rappel : votre mission commence à {{1}}, {{2}}.\n\n" +
      "Arrivez 30 minutes avant. Saluez d'abord le chef de famille. " +
      "N'oubliez pas la batterie et le badge.",
    purpose: "The three-hour confirmation that lets ops reassign a no-show in time.",
  },

  payout_sent: {
    name: "payout_sent",
    category: "utility",
    audience: "correspondent",
    language: "fr",
    params: ["montant", "événement"],
    body:
      "{{1}} viennent de vous être envoyés pour *{{2}}*. Merci.\n\n" +
      "Si vous ne recevez rien d'ici une heure, répondez à ce message.",
    purpose:
      "Same-day payment is the strongest retention lever available for gig work " +
      "(docs/05), and saying so is half of the value.",
  },
} as const satisfies Record<string, Template>;

export type TemplateName = keyof typeof TEMPLATES;

export function template(name: TemplateName): Template {
  return TEMPLATES[name];
}

/** Fills `{{n}}` placeholders. Used for previews and by the dry-run driver. */
export function render(name: TemplateName, params: readonly string[]): string {
  const t = TEMPLATES[name];
  if (params.length !== t.params.length) {
    throw new RangeError(
      `template "${name}" expects ${t.params.length} parameters ` +
        `(${t.params.join(", ")}), received ${params.length}`,
    );
  }
  return t.body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
}
