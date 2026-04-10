"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UserPreview = { id: string; username: string; email: string };

export function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  confirming,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserPreview | null;
  confirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!confirming} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Désactiver le compte</DialogTitle>
          <DialogDescription>
            L’utilisateur{" "}
            <span className="text-foreground font-medium">{user?.username ?? "—"}</span> (
            {user?.email ?? "—"}) ne pourra plus se connecter.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-eleven-pill"
            disabled={confirming}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="rounded-eleven-pill"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? "Désactivation…" : "Désactiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
