/**
 * Normalize user or scanner input to a compact ISBN-10 or ISBN-13 string, or null if invalid.
 * Safe for both server and client bundles.
 */
export function normalizeIsbn(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const compact = s.replace(/[\s-]+/g, "").toUpperCase();
  if (/^[0-9]{10}$/.test(compact)) return compact;
  if (/^[0-9]{9}X$/.test(compact)) return compact;
  if (/^[0-9]{13}$/.test(compact)) return compact;
  return null;
}
