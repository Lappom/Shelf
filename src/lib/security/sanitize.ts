export function sanitizePlainText(input: string, opts?: { maxLen?: number }) {
  const maxLen = opts?.maxLen ?? 50_000;
  const s = (input ?? "").toString();
  const withoutNulls = s.replaceAll("\0", "");
  // Drop other control characters except newline and tab.
  const cleaned = withoutNulls.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}
