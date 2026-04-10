"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReaderPrefsState = {
  readerFontFamily: string;
  readerFontSize: number;
  readerLineHeight: number;
  readerMargin: number;
  readerTheme: "light" | "dark" | "sepia";
  readerFlow: "paginated" | "scrolled";
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefs: ReaderPrefsState;
  onPatch: (patch: Partial<ReaderPrefsState>) => void;
  clampNumber: (n: number, min: number, max: number) => number;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-background shadow-eleven-card space-y-3 rounded-[20px] border border-(--eleven-border-subtle) p-4">
      <h3 className="eleven-display-section text-foreground text-lg tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-eleven-muted eleven-body-airy text-xs">{label}</span>
        <span className="text-foreground eleven-body-airy font-mono text-xs">{display}</span>
      </div>
      <input
        type="range"
        className="accent-foreground h-2 w-full cursor-pointer"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ReaderSettingsDialog({ open, onOpenChange, prefs, onPatch, clampNumber }: Props) {
  const fs = clampNumber(prefs.readerFontSize, 12, 32);
  const lh = clampNumber(prefs.readerLineHeight, 1, 2.5);
  const mg = clampNumber(prefs.readerMargin, 0, 80);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="eleven-display-section text-xl font-light tracking-tight">
            Réglages de lecture
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <Section title="Typographie">
            <SliderRow
              label="Taille du texte"
              value={fs}
              min={12}
              max={32}
              step={1}
              display={`${fs}px`}
              onChange={(n) => onPatch({ readerFontSize: clampNumber(n, 12, 32) })}
            />
            <SliderRow
              label="Interligne"
              value={lh}
              min={1}
              max={2.5}
              step={0.05}
              display={lh.toFixed(2)}
              onChange={(n) => onPatch({ readerLineHeight: clampNumber(n, 1, 2.5) })}
            />
            <SliderRow
              label="Marges latérales"
              value={mg}
              min={0}
              max={80}
              step={2}
              display={`${mg}px`}
              onChange={(n) => onPatch({ readerMargin: clampNumber(n, 0, 80) })}
            />
            <div className="space-y-2 pt-1">
              <div className="text-eleven-muted eleven-body-airy text-xs">Police</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["system", "Système"],
                    ["serif", "Serif"],
                    ["sans", "Sans"],
                    ["dyslexic", "Dyslexie"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={prefs.readerFontFamily === value ? "default" : "outline"}
                    className="rounded-eleven-pill"
                    onClick={() => onPatch({ readerFontFamily: value })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Apparence">
            <div className="space-y-2">
              <div className="text-eleven-muted eleven-body-airy text-xs">Thème</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["light", "Clair"],
                    ["dark", "Sombre"],
                    ["sepia", "Sepia"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={prefs.readerTheme === value ? "default" : "outline"}
                    className="rounded-eleven-pill"
                    onClick={() => onPatch({ readerTheme: value })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Navigation">
            <div className="space-y-2">
              <div className="text-eleven-muted eleven-body-airy text-xs">Défilement</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={prefs.readerFlow === "paginated" ? "default" : "outline"}
                  className="rounded-eleven-pill"
                  onClick={() => onPatch({ readerFlow: "paginated" })}
                >
                  Paginé
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={prefs.readerFlow === "scrolled" ? "default" : "outline"}
                  className="rounded-eleven-pill"
                  onClick={() => onPatch({ readerFlow: "scrolled" })}
                >
                  Défilement continu
                </Button>
              </div>
            </div>
          </Section>
        </div>
        <DialogFooter>
          <Button type="button" className="rounded-eleven-pill" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
