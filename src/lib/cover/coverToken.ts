import { createHmac, timingSafeEqual } from "node:crypto";

const COVER_TOKEN_TTL_SEC = 300;

export type CoverTokenPayload = {
  b: string;
  exp: number;
};

/**
 * Returns signing secret for cover URLs (HMAC). Prefer COVER_TOKEN_SECRET; fallback NEXTAUTH_SECRET.
 */
export function getCoverTokenSecret(): string | null {
  const dedicated = process.env.COVER_TOKEN_SECRET?.trim();
  if (dedicated) return dedicated;
  const auth = process.env.NEXTAUTH_SECRET?.trim();
  return auth && auth.length > 0 ? auth : null;
}

/**
 * Creates a short-lived token so Next/Image optimizer can fetch /api/books/:id/cover without session cookies.
 */
export function createCoverAccessToken(
  bookId: string,
  nowSec = Math.floor(Date.now() / 1000),
): string | null {
  const secret = getCoverTokenSecret();
  if (!secret) return null;
  const payload: CoverTokenPayload = {
    b: bookId,
    exp: nowSec + COVER_TOKEN_TTL_SEC,
  };
  const bodyB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(bodyB64).digest("base64url");
  return `${bodyB64}.${sig}`;
}

/**
 * Verifies token: signature, expiry, and book id match.
 */
export function verifyCoverAccessToken(
  token: string,
  bookId: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  const secret = getCoverTokenSecret();
  if (!secret) return false;

  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const bodyB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!bodyB64 || !sig) return false;

  const expectedSig = createHmac("sha256", secret).update(bodyB64).digest("base64url");
  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8")) as unknown;
  } catch {
    return false;
  }
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.b !== "string" || p.b !== bookId) return false;
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp) || p.exp < nowSec) return false;
  return true;
}

export { COVER_TOKEN_TTL_SEC };
