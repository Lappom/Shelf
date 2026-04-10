/**
 * Deterministic ISBN-10 → ISBN-13 conversion (EAN-13) for consistency checks.
 * Returns null if the input is not a valid 10-digit ISBN body + check character.
 */
export function isbn10ToIsbn13(isbn10: string): string | null {
  const compact = isbn10.replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[0-9]{9}[0-9X]$/.test(compact)) return null;
  const nine = compact.slice(0, 9);
  if (!/^\d{9}$/.test(nine)) return null;
  const prefix = `978${nine}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(prefix[i]);
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${prefix}${check}`;
}

/** True when ISBN-13 is the canonical EAN form of the ISBN-10 (978 prefix). */
export function isbn13CompatibleWithIsbn10(isbn13: string, isbn10: string): boolean {
  const exp = isbn10ToIsbn13(isbn10);
  if (!exp) return false;
  const n13 = isbn13.replace(/[\s-]+/g, "");
  return n13 === exp;
}
