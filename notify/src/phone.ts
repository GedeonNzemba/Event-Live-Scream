/**
 * Phone numbers, normalised to E.164.
 *
 * Meta rejects anything else, and the numbers this business handles arrive in
 * every shape a human might type: `06 12 34 56 78` from a French relative,
 * `05 551 22 33` from a correspondent in Brazzaville, `+242...`, `00242...`.
 * Getting this wrong means a wedding notification that silently never arrives.
 */

export type Country = "CG" | "FR" | "BE" | "UK" | "CA" | "US" | "DE" | "IT" | "ES" | "ZA";

const DIALLING: Record<Country, string> = {
  CG: "242", // Congo-Brazzaville
  FR: "33",
  BE: "32",
  UK: "44",
  CA: "1",
  US: "1",
  DE: "49",
  IT: "39",
  ES: "34",
  ZA: "27",
};

/** National numbers that start with a trunk prefix to be stripped. */
const TRUNK_PREFIX: Partial<Record<Country, string>> = {
  FR: "0",
  BE: "0",
  UK: "0",
  DE: "0",
  IT: "", // Italy keeps its leading zero
  ES: "",
  ZA: "0",
  CG: "0",
};

export type NormalisedPhone =
  | { readonly ok: true; readonly e164: string }
  | { readonly ok: false; readonly reason: string };

export function normalise(input: string, defaultCountry: Country = "FR"): NormalisedPhone {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  // Strip everything a human might add: spaces, dots, dashes, brackets.
  let digits = raw.replace(/[\s.\-()/]/g, "");

  // `00` is the international prefix used across Europe and Africa.
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;

  if (digits.startsWith("+")) {
    const body = digits.slice(1);
    if (!/^\d{7,15}$/.test(body)) return { ok: false, reason: "not a valid international number" };
    return { ok: true, e164: `+${body}` };
  }

  if (!/^\d+$/.test(digits)) return { ok: false, reason: "contains characters that are not digits" };

  const code = DIALLING[defaultCountry];
  const trunk = TRUNK_PREFIX[defaultCountry] ?? "";
  let national = digits;
  if (trunk && national.startsWith(trunk)) national = national.slice(trunk.length);

  // A number that already begins with its own country code, typed without a
  // plus — common when somebody copies from a contact card.
  if (national.startsWith(code) && national.length > code.length + 6) {
    return { ok: true, e164: `+${national}` };
  }

  const e164 = `+${code}${national}`;
  if (!/^\+\d{8,15}$/.test(e164)) return { ok: false, reason: "wrong number of digits" };
  return { ok: true, e164 };
}

/** For display in an ops table, never for sending. */
export function mask(e164: string): string {
  return e164.length <= 6 ? e164 : `${e164.slice(0, 5)}…${e164.slice(-3)}`;
}
