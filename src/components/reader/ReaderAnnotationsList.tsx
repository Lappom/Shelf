"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReaderAnnotationRow = {
  id: string;
  type: "highlight" | "note" | "bookmark";
  cfiRange: string;
  content: string | null;
  note: string | null;
  color: string | null;
};

type Props = {
  annotations: ReaderAnnotationRow[];
  busy: boolean;
  emptyLabel: string;
  onGo: (cfiRange: string) => void;
  onEdit: (a: ReaderAnnotationRow) => void;
  onDelete: (a: ReaderAnnotationRow) => void;
  className?: string;
};

export function ReaderAnnotationsList({
  annotations,
  busy,
  emptyLabel,
  onGo,
  onEdit,
  onDelete,
  className,
}: Props) {
  if (!annotations.length) {
    return (
      <div className={cn("text-eleven-muted eleven-body-airy text-sm", className)}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className={cn("space-y-3", className)}>
      {annotations.map((a) => (
        <div
          key={a.id}
          className="shadow-eleven-card bg-background rounded-[20px] border border-(--eleven-border-subtle) p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="eleven-body-airy text-xs font-medium tracking-wide uppercase">
              {a.type}
              {a.type === "highlight" && a.color ? (
                <span className="rounded-eleven-pill ml-2 border border-(--eleven-border-subtle) px-2 py-0.5 text-[10px] normal-case">
                  {a.color}
                </span>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              aria-label="Supprimer"
              title="Supprimer"
              type="button"
              onClick={() => onDelete(a)}
            >
              ×
            </Button>
          </div>
          {a.content ? <div className="eleven-body-airy mt-2 text-sm">{a.content}</div> : null}
          {a.note ? (
            <div className="text-eleven-muted eleven-body-airy mt-2 text-sm">{a.note}</div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-eleven-pill shadow-eleven-button-white"
              disabled={busy}
              type="button"
              onClick={() => onGo(a.cfiRange)}
            >
              Aller
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-eleven-pill shadow-eleven-button-white"
              disabled={busy}
              type="button"
              onClick={() => onEdit(a)}
            >
              Éditer
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
