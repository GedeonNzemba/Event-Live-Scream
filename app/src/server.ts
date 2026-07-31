import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { eur } from "../../pool/src/money.ts";
import { FamilyPool } from "../../pool/src/pool.ts";
import { allPresences, getPresence, newReference, poolFor, type Presence, savePresence, updatePool } from "./db.ts";
import { homePage, opsPage, poolPage } from "./pages.ts";
import { tier } from "./tiers.ts";

/**
 * The booking and family-pool flow.
 *
 * Zero dependencies, so `node src/server.ts` is the whole setup. Every business
 * rule lives in ../../pool, where it is tested; this file is transport, routing
 * and HTML.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------- helpers --

function send(res: ServerResponse, status: number, body: string, type = "text/html; charset=utf-8"): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    // The pages render user-supplied names; escaping in html.ts is the primary
    // defence and these are the belt to its braces.
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'",
    "referrer-policy": "same-origin",
  });
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, "cache-control": "no-store" });
  res.end();
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // A booking form is a few hundred bytes; anything larger is not a booking.
    if (size > 64 * 1024) throw new Error("payload too large");
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function originOf(req: IncomingMessage): string {
  const host = req.headers.host ?? `localhost:${PORT}`;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  return `${proto}://${host}`;
}

function flashFrom(url: URL): { kind: "ok" | "warn" | "bad"; message: string } | undefined {
  const message = url.searchParams.get("m");
  if (!message) return undefined;
  const kind = url.searchParams.get("k");
  return { kind: kind === "bad" ? "bad" : kind === "warn" ? "warn" : "ok", message };
}

function str(form: URLSearchParams, key: string, max = 120): string {
  return (form.get(key) ?? "").trim().slice(0, max);
}

// ----------------------------------------------------------------- routes --

async function serveStatic(res: ServerResponse, name: string): Promise<boolean> {
  // Only ever serve known files; never join user input onto a filesystem path.
  const allowed: Record<string, string> = { "/styles.css": "text/css; charset=utf-8" };
  const type = allowed[name];
  if (!type) return false;
  try {
    const body = await readFile(join(PUBLIC, name.slice(1)), "utf8");
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

function createBooking(form: URLSearchParams): { ok: true; reference: string } | { ok: false; error: string } {
  const eventName = str(form, "eventName", 80);
  const place = str(form, "place", 80);
  const bookerName = str(form, "bookerName", 40);
  const bookerCountry = str(form, "bookerCountry", 2) || "FR";
  const when = str(form, "when", 40);
  const t = tier(str(form, "tierId", 20));
  const expected = Math.max(1, Math.min(60, Number(form.get("expected")) || 9));

  if (!eventName) return { ok: false, error: "Il faut un nom d'événement." };
  if (!place) return { ok: false, error: "Il faut un lieu." };
  if (!bookerName) return { ok: false, error: "Il faut votre prénom." };
  if (!t) return { ok: false, error: "Choisissez une formule." };

  const whenDate = new Date(when);
  if (Number.isNaN(whenDate.getTime())) return { ok: false, error: "La date n'est pas valide." };

  const reference = newReference();
  const pool = new FamilyPool({
    reference,
    eventName,
    target: t.price,
    bookerName,
    bookerCountry,
    expectedParticipants: expected,
  });

  const presence: Presence = {
    reference,
    eventName,
    tierId: t.id,
    whenISO: whenDate.toISOString(),
    place,
    bookerName,
    bookerCountry,
    createdAtISO: new Date().toISOString(),
    pool: pool.toSnapshot(),
  };
  savePresence(presence);
  return { ok: true, reference };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", originOf(req));
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && (await serveStatic(res, path))) return;

  // GET /
  if (method === "GET" && path === "/") {
    return send(res, 200, homePage(url.searchParams.get("error") ?? undefined));
  }

  // POST /book
  if (method === "POST" && path === "/book") {
    const result = createBooking(await readForm(req));
    return result.ok
      ? redirect(res, `/p/${result.reference}?k=ok&m=${encodeURIComponent("Cagnotte créée. Partagez le lien avec la famille.")}`)
      : redirect(res, `/?error=${encodeURIComponent(result.error)}`);
  }

  // GET /ops
  if (method === "GET" && path === "/ops") {
    const rows = allPresences().map((presence) => ({ presence, pool: poolFor(presence) }));
    return send(res, 200, opsPage(rows, flashFrom(url)));
  }

  const poolMatch = /^\/p\/([A-Z0-9]{4,12})(\/(contribute|close|deliver|refund))?$/.exec(path);
  if (poolMatch) {
    const reference = poolMatch[1];
    const action = poolMatch[3];
    const presence = getPresence(reference);
    if (!presence) return send(res, 404, notFound(reference));

    if (method === "GET" && !action) {
      return send(res, 200, poolPage(presence, poolFor(presence), originOf(req), flashFrom(url)));
    }

    if (method === "POST" && action === "contribute") {
      const form = await readForm(req);
      const name = str(form, "name", 40);
      const country = str(form, "country", 2) || "FR";
      const amount = eur(Number(form.get("amount")));

      if (!name) return redirect(res, `/p/${reference}?k=bad&m=${encodeURIComponent("Il faut un prénom.")}`);

      try {
        updatePool(presence, (pool) => {
          // Someone contributing to a second event in the same family is not a
          // new customer; this is what keeps the growth number honest.
          const known = pool.all.some((c) => c.name.toLowerCase() === name.toLowerCase());
          pool.contribute(name, country, amount, { firstTime: !known && name !== presence.bookerName });
        });
        return redirect(res, `/p/${reference}?k=ok&m=${encodeURIComponent(`Merci ${name} !`)}`);
      } catch (err) {
        // The domain model throws RangeError for a rejected amount and Error
        // for a closed pool; both carry a message worth turning into French.
        const message = err instanceof Error ? explain(err.message) : "Participation impossible.";
        return redirect(res, `/p/${reference}?k=bad&m=${encodeURIComponent(message)}`);
      }
    }

    if (method === "POST" && action === "close") {
      let summary = "";
      updatePool(presence, (pool) => {
        const r = pool.closeAtDeadline();
        summary = r.shortfall > 0
          ? `Clôturée. Complément de ${(r.shortfall / 100).toFixed(2)} € débité à ${presence.bookerName}.`
          : r.surplus > 0
            ? `Clôturée. Surplus de ${(r.surplus / 100).toFixed(2)} € converti en avoir famille.`
            : "Clôturée, objectif atteint exactement.";
      });
      return redirect(res, `/ops?k=ok&m=${encodeURIComponent(summary)}`);
    }

    if (method === "POST" && action === "deliver") {
      try {
        updatePool(presence, (pool) => pool.markDelivered());
        return redirect(res, `/ops?k=ok&m=${encodeURIComponent("Livrée — archive complète.")}`);
      } catch {
        return redirect(res, `/ops?k=bad&m=${encodeURIComponent("Il faut clôturer la cagnotte avant de livrer.")}`);
      }
    }

    if (method === "POST" && action === "refund") {
      let summary = "";
      updatePool(presence, (pool) => {
        const r = pool.refundAll("failed");
        summary =
          `Remboursé ${(r.refunded / 100).toFixed(2)} € à ${r.contributorsRefunded} participants. ` +
          `${(r.unrecoverableFees / 100).toFixed(2)} € de frais non récupérables.`;
      });
      return redirect(res, `/ops?k=warn&m=${encodeURIComponent(summary)}`);
    }
  }

  send(res, 404, notFound());
}

function explain(message: string): string {
  if (message.includes("minimum")) return "Le minimum est de 5 €.";
  if (message.includes("overfunding")) return "La cagnotte a déjà largement dépassé son objectif.";
  if (message.includes("closed")) return "La cagnotte est fermée.";
  return "Participation impossible.";
}

function notFound(reference?: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Introuvable — Elongo</title><link rel="stylesheet" href="/styles.css" /></head>
<body><main><h1>Introuvable</h1>
<p class="lede">${reference ? `Aucune cagnotte avec la référence <b class="mono">${reference}</b>.` : "Cette page n'existe pas."}</p>
<p><a class="btn" href="/">Retour</a></p></main></body></html>`;
}

// ------------------------------------------------------------------ start --

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("request failed:", err);
    if (!res.headersSent) send(res, 500, notFound());
    else res.end();
  });
});

server.listen(PORT, () => {
  // Tests bind port 0 to get a free port; no banner in that case.
  if (PORT === 0) return;
  const addr = server.address();
  const port = addr && typeof addr !== "string" ? addr.port : PORT;
  console.log("");
  console.log(`  Elongo — booking and family pool`);
  console.log("");
  console.log(`  Réserver     http://localhost:${port}/`);
  console.log(`  Opérations   http://localhost:${port}/ops`);
  console.log("");
  console.log(`  Three example bookings:  npm run seed`);
  console.log("");
});

export { handle, server };
