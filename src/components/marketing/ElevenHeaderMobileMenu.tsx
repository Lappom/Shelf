"use client";

import Link from "next/link";
import { MenuIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#workflow", label: "Workflow" },
  { href: "#privacy", label: "Données" },
] as const;

export function ElevenHeaderMobileMenu() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-eleven-pill lg:hidden"
          aria-label="Ouvrir le menu"
        >
          <MenuIcon className="size-5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          data-slot="dialog-content"
          className={cn(
            "bg-popover text-popover-foreground shadow-eleven-card fixed top-0 right-0 z-50 flex h-full max-h-none w-[min(100%,20rem)] flex-col border-l border-[var(--eleven-border-subtle)] outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right",
            "duration-300 motion-reduce:animate-none motion-reduce:data-closed:animate-none",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex items-center justify-between border-b border-[var(--eleven-border-subtle)] px-4 py-3">
            <span className="font-heading eleven-body-airy text-base font-light">Menu</span>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fermer le menu">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Sections">
            {NAV_LINKS.map(({ href, label }) => (
              <DialogClose asChild key={href}>
                <Button asChild variant="ghost" className="h-11 justify-start rounded-xl px-3">
                  <a href={href}>{label}</a>
                </Button>
              </DialogClose>
            ))}
          </nav>
          <div className="flex flex-col gap-2 border-t border-[var(--eleven-border-subtle)] p-4">
            <DialogClose asChild>
              <Button asChild variant="whitePill" size="lg" className="w-full">
                <Link href="/register">Créer un compte</Link>
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button asChild variant="warmStone" size="warm" className="w-full">
                <Link href="/login">Connexion</Link>
              </Button>
            </DialogClose>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
