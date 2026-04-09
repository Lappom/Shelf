import { z } from "zod";

const SortSchema = z.enum([
  "relevance",
  "title",
  "added_at",
  "publish_date",
  "author",
  "progress",
  "page_count",
]);
const DirSchema = z.enum(["asc", "desc"]);
const ModeSchema = z.enum(["websearch", "plain"]);

export type SearchUrlState = {
  q: string;
  mode: z.infer<typeof ModeSchema>;
  sort: z.infer<typeof SortSchema>;
  dir: z.infer<typeof DirSchema>;
  formats: string[];
  languages: string[];
  tagIds: string[];
  shelfId: string;
  statuses: string[];
  author: string;
  publisher: string;
  addedFrom: string;
  addedTo: string;
  pagesMin: string;
  pagesMax: string;
};

function splitCsv(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function parseSearchUrlState(search: string): Partial<SearchUrlState> {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: Partial<SearchUrlState> = {};

  const q = sp.get("q");
  if (q != null) out.q = q;

  const mode = ModeSchema.safeParse(sp.get("mode"));
  if (mode.success) out.mode = mode.data;

  const sort = SortSchema.safeParse(sp.get("sort"));
  if (sort.success) out.sort = sort.data;

  const dir = DirSchema.safeParse(sp.get("dir"));
  if (dir.success) out.dir = dir.data;

  out.formats = splitCsv(sp.get("formats"));
  out.languages = splitCsv(sp.get("languages"));
  out.tagIds = splitCsv(sp.get("tagIds"));
  out.statuses = splitCsv(sp.get("statuses"));

  out.shelfId = sp.get("shelfId") ?? "";
  out.author = sp.get("author") ?? "";
  out.publisher = sp.get("publisher") ?? "";
  out.addedFrom = sp.get("addedFrom") ?? "";
  out.addedTo = sp.get("addedTo") ?? "";
  out.pagesMin = sp.get("pagesMin") ?? "";
  out.pagesMax = sp.get("pagesMax") ?? "";

  return out;
}

export function buildSearchUrlFromState(state: Partial<SearchUrlState>): string {
  const params = new URLSearchParams();

  const q = (state.q ?? "").trim();
  if (q) params.set("q", q);

  if (state.mode) params.set("mode", state.mode);
  if (state.sort) params.set("sort", state.sort);
  if (state.dir) params.set("dir", state.dir);

  if (state.formats?.length) params.set("formats", state.formats.join(","));
  if (state.languages?.length) params.set("languages", state.languages.join(","));
  if (state.tagIds?.length) params.set("tagIds", state.tagIds.join(","));
  if (state.shelfId) params.set("shelfId", state.shelfId);
  if (state.statuses?.length) params.set("statuses", state.statuses.join(","));

  if (state.author?.trim()) params.set("author", state.author.trim());
  if (state.publisher?.trim()) params.set("publisher", state.publisher.trim());
  if (state.addedFrom?.trim()) params.set("addedFrom", state.addedFrom.trim());
  if (state.addedTo?.trim()) params.set("addedTo", state.addedTo.trim());
  if (state.pagesMin?.trim()) params.set("pagesMin", state.pagesMin.trim());
  if (state.pagesMax?.trim()) params.set("pagesMax", state.pagesMax.trim());

  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

