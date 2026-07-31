import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Viewer tokens.
 *
 * Per docs/09, a Presence is private by default: an unlisted link that can be
 * forwarded forever is not access control, and the family pool, paid recording
 * access and the contribution rail all need to know who is watching.
 *
 * A token is `presenceId.viewerId.expiry.signature`, signed with HMAC-SHA256.
 * Stateless, so playback needs no database lookup on the hot path — but the
 * revocation list means a single viewer can still be cut off without
 * invalidating everyone else's link.
 */

const SECRET =
  process.env.ELONGO_TOKEN_SECRET ??
  // Ephemeral per process, so a forgotten environment variable fails closed:
  // every existing link stops working on restart rather than silently
  // accepting tokens signed with a guessable default.
  randomBytes(32).toString("hex");

if (!process.env.ELONGO_TOKEN_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("ELONGO_TOKEN_SECRET must be set outside development");
}

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

/** Viewer ids that have been cut off, keyed `presenceId:viewerId`. */
const revoked = new Set<string>();

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function issueToken(
  presenceId: string,
  viewerId: string,
  ttlMs = DEFAULT_TTL_MS,
): string {
  const expiry = Date.now() + ttlMs;
  const payload = `${presenceId}.${viewerId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export type TokenCheck =
  | { readonly ok: true; readonly presenceId: string; readonly viewerId: string }
  | { readonly ok: false; readonly reason: "malformed" | "bad-signature" | "expired" | "revoked" };

export function verifyToken(token: string, presenceId: string): TokenCheck {
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };

  const [tokenPresence, viewerId, expiryRaw, signature] = parts;
  const payload = `${tokenPresence}.${viewerId}.${expiryRaw}`;
  const expected = sign(payload);

  // Constant-time compare so a token cannot be brute-forced byte by byte.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  // Checked after the signature: a token for another Presence is a forgery
  // attempt, not a formatting mistake, and should not be distinguishable.
  if (tokenPresence !== presenceId) return { ok: false, reason: "bad-signature" };

  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return { ok: false, reason: "expired" };
  if (revoked.has(`${presenceId}:${viewerId}`)) return { ok: false, reason: "revoked" };

  return { ok: true, presenceId: tokenPresence, viewerId };
}

export function revokeViewer(presenceId: string, viewerId: string): void {
  revoked.add(`${presenceId}:${viewerId}`);
}

export function clearRevocations(): void {
  revoked.clear();
}

/** Constant-time comparison for the capture client's shared key. */
export function keyMatches(supplied: string, actual: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newCaptureKey(): string {
  return randomBytes(24).toString("base64url");
}
