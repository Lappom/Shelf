import { API_KEY_PREFIX } from "./constants";

/**
 * Extract raw API key token from Authorization header value.
 */
export function parseBearerApiKey(authorization: string | null): string | null {
  if (!authorization) return null;
  const m = authorization.match(/^\s*Bearer\s+(\S+)\s*$/i);
  if (!m) return null;
  const token = m[1];
  if (!token.startsWith(API_KEY_PREFIX)) return null;
  return token;
}
