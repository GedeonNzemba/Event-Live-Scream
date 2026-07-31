import { eur, type Money } from "../../pool/src/money.ts";

/** The service tiers from docs/02-solution.md. */
export type Tier = {
  readonly id: string;
  readonly name: string;
  readonly duration: string;
  readonly price: Money;
  readonly typicalFor: string;
  readonly includes: readonly string[];
};

export const TIERS: readonly Tier[] = [
  {
    id: "appel",
    name: "Appel",
    duration: "30 minutes",
    price: eur(15),
    typicalFor: "Un anniversaire, une salutation, un résultat scolaire",
    includes: ["Direct", "Enregistrement complet"],
  },
  {
    id: "fete",
    name: "Fête",
    duration: "jusqu'à 3 heures",
    price: eur(39),
    typicalFor: "Anniversaire, baptême, fiançailles, retour au pays",
    includes: ["Direct", "Enregistrement complet", "10 photos"],
  },
  {
    id: "ceremonie",
    name: "Cérémonie",
    duration: "jusqu'à 8 heures",
    price: eur(89),
    typicalFor: "Dot, mariage à l'église, matanga, retrait de deuil",
    includes: ["Direct", "Enregistrement complet", "Résumé de 3 minutes", "30 photos"],
  },
  {
    id: "grand",
    name: "Grand Événement",
    duration: "2 à 3 jours",
    price: eur(250),
    typicalFor: "Mariage complet, grandes funérailles",
    includes: ["2 correspondants", "Plusieurs séquences", "Film monté"],
  },
];

export function tier(id: string): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}

/** Countries we accept contributions from, with the flag used in the UI. */
export const COUNTRIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "DE", label: "Allemagne" },
  { code: "IT", label: "Italie" },
  { code: "ES", label: "Espagne" },
  { code: "UK", label: "Royaume-Uni" },
  { code: "CA", label: "Canada" },
  { code: "US", label: "États-Unis" },
  { code: "ZA", label: "Afrique du Sud" },
];

export function countryLabel(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.label ?? code;
}
