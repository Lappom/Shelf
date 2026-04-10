"use client";

import { LayoutGridIcon, ListIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LibraryViewToggle({
  view,
  onViewChange,
  disabled,
}: {
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="rounded-eleven-pill shadow-eleven-card relative flex h-9 min-w-[4.75rem] items-stretch border p-0.5"
      role="group"
      aria-label="Mode d’affichage"
    >
      <span
        aria-hidden
        className={cn(
          "bg-secondary pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-4px)] rounded-eleven-pill transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          view === "list" && "translate-x-[calc(100%+8px)]",
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="relative z-[1] min-w-0 flex-1 rounded-eleven-pill px-2"
        onClick={() => onViewChange("grid")}
        disabled={disabled}
        data-testid="library-view-grid"
        aria-pressed={view === "grid"}
      >
        <LayoutGridIcon className="h-4 w-4" />
        <span className="sr-only">Grille</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="relative z-[1] min-w-0 flex-1 rounded-eleven-pill px-2"
        onClick={() => onViewChange("list")}
        disabled={disabled}
        data-testid="library-view-list"
        aria-pressed={view === "list"}
      >
        <ListIcon className="h-4 w-4" />
        <span className="sr-only">Liste</span>
      </Button>
    </div>
  );
}
