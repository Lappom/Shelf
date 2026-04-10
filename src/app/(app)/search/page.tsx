import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUserPage } from "@/lib/auth/rbac";
import { SearchPageClient } from "@/components/search/SearchPageClient";

const LEGACY_LIBRARY_PARAMS = [
  "mode",
  "sort",
  "dir",
  "formats",
  "languages",
  "tagIds",
  "shelfId",
  "statuses",
  "author",
  "publisher",
  "addedFrom",
  "addedTo",
  "pagesMin",
  "pagesMax",
] as const;

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUserPage();
  const role = (user as { role?: unknown }).role;
  const isAdmin = role === "admin";

  const sp = searchParams ? await searchParams : undefined;
  const raw = new URLSearchParams();
  if (sp) {
    for (const [k, v] of Object.entries(sp)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) raw.append(k, item);
      } else {
        raw.set(k, v);
      }
    }
  }

  const hasLegacyLibrary = LEGACY_LIBRARY_PARAMS.some((p) => raw.has(p));
  if (hasLegacyLibrary) {
    const qs = raw.toString();
    redirect(qs ? `/library?${qs}` : "/library");
  }

  const qRaw = raw.get("q");
  const initialCatalogQ = typeof qRaw === "string" && qRaw.trim() ? qRaw.slice(0, 200) : "";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="catalog-hero-enter mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="eleven-display-section text-2xl tracking-tight sm:text-3xl">Catalogue</h1>
        <Link
          className="text-eleven-muted hover:text-foreground text-sm underline-offset-4 hover:underline"
          href="/library"
        >
          Bibliothèque
        </Link>
      </header>

      <SearchPageClient initialCatalogQ={initialCatalogQ} isAdmin={isAdmin} />
    </div>
  );
}
