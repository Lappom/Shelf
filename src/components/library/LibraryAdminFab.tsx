"use client";

import * as React from "react";
import { BookPlusIcon, FileUpIcon, PlusIcon } from "lucide-react";

import { AddPhysicalBookDialog } from "@/components/book/AddPhysicalBookDialog";
import { UploadEpubDialog } from "@/components/book/UploadEpubDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Floating add button for admins (SPECS §11.2 Library — FAB on larger viewports).
 */
export function LibraryAdminFab() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [epubOpen, setEpubOpen] = React.useState(false);
  const [physicalOpen, setPhysicalOpen] = React.useState(false);

  return (
    <>
      <div className="fixed right-6 bottom-24 z-40 hidden md:block">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="lg"
              className="shadow-eleven-button-white h-14 w-14 rounded-full"
              aria-label="Ajouter un livre"
            >
              <PlusIcon className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                setEpubOpen(true);
              }}
            >
              <FileUpIcon className="mr-2 h-4 w-4" />
              Importer un EPUB
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                setPhysicalOpen(true);
              }}
            >
              <BookPlusIcon className="mr-2 h-4 w-4" />
              Livre physique
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <UploadEpubDialog
        hideTrigger
        open={epubOpen}
        onOpenChange={setEpubOpen}
        triggerText="Importer un EPUB"
      />
      <AddPhysicalBookDialog
        hideTrigger
        open={physicalOpen}
        onOpenChange={setPhysicalOpen}
        triggerText="Ajouter un livre physique"
      />
    </>
  );
}
