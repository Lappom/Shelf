"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookmarkIcon, LayersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addBookToShelfAction, removeBookFromShelfAction } from "@/app/(app)/shelves/actions";

export type AddToShelfMenuShelf = {
  id: string;
  name: string;
  icon: string | null;
  type: "manual" | "favorites";
  checked: boolean;
};

export function AddToShelfMenu({
  bookId,
  shelves,
}: {
  bookId: string;
  shelves: AddToShelfMenuShelf[];
}) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();
  const [state, setState] = React.useState<AddToShelfMenuShelf[]>(shelves);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          <LayersIcon />
          Ajouter à une étagère
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Étagères</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {state.length ? (
          state.map((s) => (
            <DropdownMenuCheckboxItem
              key={s.id}
              checked={s.checked}
              onCheckedChange={(checked) => {
                setState((prev) =>
                  prev.map((x) => (x.id === s.id ? { ...x, checked: Boolean(checked) } : x)),
                );
                startTransition(async () => {
                  if (checked) {
                    await addBookToShelfAction({ shelfId: s.id, bookId });
                  } else {
                    await removeBookFromShelfAction({ shelfId: s.id, bookId });
                  }
                  router.refresh();
                });
              }}
              disabled={busy}
            >
              <span className="mr-1 inline-flex w-5 justify-center">
                {s.icon ?? (s.type === "favorites" ? "⭐" : <BookmarkIcon className="size-4" />)}
              </span>
              <span>{s.name}</span>
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <div className="text-muted-foreground px-2 py-1.5 text-sm">Aucune étagère.</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
