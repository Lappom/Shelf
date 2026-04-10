"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type FlatTocItem = { href: string; label: string; depth: number };

type Props = {
  items: FlatTocItem[];
  emptyLabel: string;
  onNavigate: (href: string) => void;
  listClassName?: string;
};

export function ReaderTocList({ items, emptyLabel, onNavigate, listClassName }: Props) {
  if (!items.length) {
    return <div className="text-eleven-muted eleven-body-airy px-2 py-2 text-sm">{emptyLabel}</div>;
  }
  return (
    <div className={cn("px-2 pb-3", listClassName)}>
      {items.map((it, index) => (
        <button
          key={`${it.href}-${it.depth}-${index}`}
          type="button"
          className={cn(
            "hover:bg-muted/80 eleven-body-airy rounded-eleven-warm w-full px-2 py-2 text-left text-sm transition-colors",
            "reader-toc-item-enter",
          )}
          style={
            {
              paddingLeft: 8 + it.depth * 14,
              "--reader-toc-delay": `${Math.min(index, 24) * 35}ms`,
            } as React.CSSProperties
          }
          onClick={() => onNavigate(it.href)}
        >
          {it.label || it.href}
        </button>
      ))}
    </div>
  );
}
