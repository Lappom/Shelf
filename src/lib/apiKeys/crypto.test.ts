import { describe, expect, test } from "vitest";

import { API_KEY_PREFIX } from "./constants";
import { generateApiKeyMaterial, hashApiKeyToken } from "./crypto";

describe("apiKeys crypto", () => {
  test("generates sk_shelf token with 48 hex secret and stable hash", () => {
    const a = generateApiKeyMaterial();
    expect(a.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.token.length).toBe(API_KEY_PREFIX.length + 48);
    expect(a.hash).toBe(hashApiKeyToken(a.token));
    expect(a.prefix).toBe(a.token.slice(0, 16));
  });
});
