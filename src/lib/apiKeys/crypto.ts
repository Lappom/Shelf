import { createHash, randomBytes } from "node:crypto";

import { API_KEY_PREFIX, API_KEY_SECRET_HEX_LENGTH } from "./constants";

export function hashApiKeyToken(fullToken: string): string {
  return createHash("sha256").update(fullToken, "utf8").digest("hex");
}

/**
 * Returns full token (shown once), db hash, and short prefix for listing.
 */
export function generateApiKeyMaterial(): { token: string; hash: string; prefix: string } {
  const secret = randomBytes(API_KEY_SECRET_HEX_LENGTH / 2).toString("hex");
  if (secret.length !== API_KEY_SECRET_HEX_LENGTH) {
    throw new Error("Unexpected API key secret length");
  }
  const token = `${API_KEY_PREFIX}${secret}`;
  const hash = hashApiKeyToken(token);
  const prefix = token.slice(0, 16);
  return { token, hash, prefix };
}
