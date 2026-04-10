"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGridIcon, SearchIcon, ShieldIcon, LayersIcon, UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match: (pathname: string) => boolean;
};

function isSubpath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function MobileBottomNav({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname() ?? "/";

  // Reader should be fullscreen and distraction-free.
  if (isSubpath(pathname, "/reader")) return null;

  const items: Item[] = [
    {
      href: "/library",
      label: "Bibliothèque",
      icon: LayoutGridIcon,
      match: (p: string) => isSubpath(p, "/library") || isSubpath(p, "/book"),
    },
    {
      href: "/shelves",
      label: "Étagères",
      icon: LayersIcon,
      match: (p: string) => isSubpath(p, "/shelves"),
    },
    {
      href: "/search",
      label: "Catalogue",
      icon: SearchIcon,
      match: (p: string) => isSubpath(p, "/search"),
    },
    {
      href: "/profile",
      label: "Profil",
      icon: UserIcon,
      match: (p: string) => isSubpath(p, "/profile"),
    },
    ...(showAdmin
      ? [
          {
            href: "/admin/books",
            label: "Admin",
            icon: ShieldIcon,
            match: (p: string) => isSubpath(p, "/admin"),
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className="bg-background/90 fixed inset-x-0 bottom-0 z-50 border-t border-(--eleven-border-subtle) backdrop-blur sm:hidden"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-4 px-1 py-2 sm:px-2">
        {items.slice(0, 4).map((it) => {
          const active = it.match(pathname);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "rounded-2xl border px-2 py-2 text-center text-xs transition",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                active
                  ? "border-foreground/15 bg-secondary text-foreground shadow-eleven-card ring-1 ring-foreground/10"
                  : "border-(--eleven-border-subtle) bg-background/80 text-eleven-muted shadow-eleven-button-white hover:bg-secondary hover:text-foreground hover:shadow-eleven-card",
              )}
            >
              <span className="mx-auto flex w-fit items-center gap-2">
                <Icon className={cn("h-4 w-4", active ? "text-foreground" : "text-eleven-muted")} />
                <span className="eleven-body-airy">{it.label}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {showAdmin ? (
        <div className="mx-auto max-w-5xl px-2 pb-2">
          {(() => {
            const admin = items.find((i) => i.href === "/admin/books");
            if (!admin) return null;
            const active = admin.match(pathname);
            const Icon = admin.icon;
            return (
              <Link
                href={admin.href}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs transition",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  active
                    ? "border-foreground/15 bg-secondary text-foreground shadow-eleven-card ring-1 ring-foreground/10"
                    : "border-(--eleven-border-subtle) bg-background/80 text-eleven-muted shadow-eleven-button-white hover:bg-secondary hover:text-foreground hover:shadow-eleven-card",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-foreground" : "text-eleven-muted")} />
                <span className="eleven-body-airy">{admin.label}</span>
              </Link>
            );
          })()}
        </div>
      ) : null}
    </nav>
  );
}
