import { z } from "zod";

const CursorSchema = z.object({
  score: z.number(),
  bookId: z.string().uuid(),
});

export function encodeRecoCursor(c: { score: number; bookId: string }): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeRecoCursor(
  s: string | null | undefined,
): { score: number; bookId: string } | null {
  if (!s?.trim()) return null;
  try {
    const raw = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    const p = CursorSchema.safeParse(raw);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
