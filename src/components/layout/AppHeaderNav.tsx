"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function isSubpath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

type Item = { href: string; label: string; match: (pathname: string) => boolean };

const ITEMS: Item[] = [
  {
    href: "/library",
    label: "Bibliothèque",
    match: (p) => isSubpath(p, "/library") || isSubpath(p, "/book"),
  },
  { href: "/shelves", label: "Étagères", match: (p) => isSubpath(p, "/shelves") },
  { href: "/search", label: "Catalogue", match: (p) => isSubpath(p, "/search") },
];

export function AppHeaderNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="hidden items-center gap-1.5 sm:flex" aria-label="Navigation">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        return (
          <Button
            key={it.href}
            asChild
            size="sm"
            variant="outline"
            className={cn(
              "rounded-eleven-pill eleven-body-airy bg-background/80 shadow-eleven-button-white border-(--eleven-border-subtle)",
              "hover:bg-secondary hover:shadow-eleven-card",
              "focus-visible:ring-ring/60 focus-visible:ring-2",
              active &&
                "border-foreground/15 bg-secondary text-foreground shadow-eleven-card ring-foreground/10 ring-1",
            )}
          >
            <Link href={it.href} aria-current={active ? "page" : undefined}>
              {it.label}
            </Link>
          </Button>
        );
      })}
      {isAdmin ? (
        <Button
          asChild
          size="sm"
          variant="outline"
          className={cn(
            "rounded-eleven-pill eleven-body-airy bg-background/80 shadow-eleven-button-white border-(--eleven-border-subtle)",
            "hover:bg-secondary hover:shadow-eleven-card",
            "focus-visible:ring-ring/60 focus-visible:ring-2",
            isSubpath(pathname, "/admin") &&
              "border-foreground/15 bg-secondary text-foreground shadow-eleven-card ring-foreground/10 ring-1",
          )}
        >
          <Link
            href="/admin/books"
            aria-current={isSubpath(pathname, "/admin") ? "page" : undefined}
          >
            Admin
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
