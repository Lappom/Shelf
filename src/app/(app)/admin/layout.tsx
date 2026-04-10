import Link from "next/link";

import { requireAdmin } from "@/lib/auth/rbac";
import { Button } from "@/components/ui/button";

function AdminNav() {
  const items = [
    { href: "/admin/books", label: "Livres" },
    { href: "/admin/users", label: "Utilisateurs" },
    { href: "/admin/duplicates", label: "Doublons" },
    { href: "/admin/tags", label: "Tags" },
    { href: "/admin/import-calibre", label: "Import Calibre" },
    { href: "/admin/pull-books", label: "Pull Open Library" },
    { href: "/admin/metadata-merge-audits", label: "Audit merge métadonnées" },
    { href: "/admin/storage", label: "Stockage" },
    { href: "/admin/settings", label: "Paramètres" },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <Button key={it.href} asChild size="sm" variant="ghost" className="rounded-eleven-pill">
          <Link href={it.href}>{it.label}</Link>
        </Button>
      ))}
    </div>
  );
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">Admin</div>
          <h1 className="eleven-display-section text-3xl">Console</h1>
        </div>
        <AdminNav />
      </div>
      <div>{children}</div>
    </div>
  );
}
