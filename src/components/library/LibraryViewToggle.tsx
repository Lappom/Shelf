"use client";

import { LayoutGridIcon, ListIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

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
    <div className="rounded-eleven-pill shadow-eleven-card flex items-center border">
      <Button
        type="button"
        variant={view === "grid" ? "secondary" : "ghost"}
        size="sm"
        className="rounded-eleven-pill"
        onClick={() => onViewChange("grid")}
        disabled={disabled}
        data-testid="library-view-grid"
      >
        <LayoutGridIcon className="h-4 w-4" />
        <span className="sr-only">Grille</span>
      </Button>
      <Button
        type="button"
        variant={view === "list" ? "secondary" : "ghost"}
        size="sm"
        className="rounded-eleven-pill"
        onClick={() => onViewChange("list")}
        disabled={disabled}
        data-testid="library-view-list"
      >
        <ListIcon className="h-4 w-4" />
        <span className="sr-only">Liste</span>
      </Button>
    </div>
  );
}
