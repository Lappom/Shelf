export type RecoReason = { code: string; text: string };

export function parseRecoReasons(raw: unknown): RecoReason[] {
  if (!Array.isArray(raw)) return [];
  const out: RecoReason[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : "";
    const text = typeof o.text === "string" ? o.text : "";
    if (!code || !text) continue;
    out.push({ code, text });
  }
  return out;
}

export function primaryReasonText(raw: unknown): string | null {
  const list = parseRecoReasons(raw);
  return list[0]?.text ?? null;
}

export const RECO_REASON_FILTER_CODES: { code: string; label: string }[] = [
  { code: "because_liked", label: "Parce que vous avez aimé…" },
  { code: "same_author", label: "Même auteur" },
  { code: "similar_subject", label: "Sujet proche" },
  { code: "neighbor_user", label: "Goûts proches" },
  { code: "read_together", label: "Co-lecture" },
  { code: "similar_tags", label: "Tags" },
  { code: "popular", label: "Populaire" },
  { code: "recent", label: "Récent" },
];
