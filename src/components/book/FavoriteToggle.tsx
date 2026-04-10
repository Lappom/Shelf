"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HeartIcon } from "lucide-react";

import { addBookToShelfAction, removeBookFromShelfAction } from "@/app/(app)/shelves/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  bookId: string;
  favoritesShelfId: string;
  initialFavorite: boolean;
  className?: string;
};

export function FavoriteToggle({ bookId, favoritesShelfId, initialFavorite, className }: Props) {
  const router = useRouter();
  const [on, setOn] = React.useState(initialFavorite);
  const [busy, startTransition] = React.useTransition();

  React.useEffect(() => {
    setOn(initialFavorite);
  }, [initialFavorite]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = next
        ? await addBookToShelfAction({ shelfId: favoritesShelfId, bookId })
        : await removeBookFromShelfAction({ shelfId: favoritesShelfId, bookId });
      if (!res.ok) {
        setOn(!next);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={busy}
      className={cn("rounded-eleven-pill shrink-0", className)}
      aria-pressed={on}
      aria-label={on ? "Retirer des favoris" : "Ajouter aux favoris"}
      onClick={toggle}
    >
      <HeartIcon
        className={cn("size-4", on ? "fill-red-500 text-red-500" : "text-muted-foreground")}
      />
    </Button>
  );
}
