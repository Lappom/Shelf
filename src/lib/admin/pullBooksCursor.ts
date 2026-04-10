import { z } from "zod";
import { createHash } from "node:crypto";

const CursorPayloadSchema = z.object({
  v: z.literal(1),
  q: z.string().min(1).max(500),
  offset: z.number().int().min(0),
});

export type PullBooksCursorPayload = z.infer<typeof CursorPayloadSchema>;

export function encodePullBooksCursor(payload: PullBooksCursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodePullBooksCursor(cursor: string): PullBooksCursorPayload {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
  const res = CursorPayloadSchema.safeParse(parsed);
  if (!res.success) throw new Error("INVALID_CURSOR");
  return res.data;
}

export function hashPullBooksQuery(query: string): string {
  return createHash("sha256").update(query, "utf8").digest("hex");
}
