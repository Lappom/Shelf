"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

type ProgressStatus = "not_started" | "reading" | "finished" | "abandoned";

const OPTIONS: { value: ProgressStatus; label: string }[] = [
  { value: "not_started", label: "Non lu" },
  { value: "reading", label: "En cours" },
  { value: "finished", label: "Lu" },
  { value: "abandoned", label: "Abandonné" },
];

type BookFormat = "epub" | "physical" | "pdf" | "cbz" | "cbr" | "audiobook";

type Props = {
  bookId: string;
  bookFormat: BookFormat;
  initialStatus: ProgressStatus;
  className?: string;
};

export function BookReadingStatusSelect({ bookId, bookFormat, initialStatus, className }: Props) {
  const router = useRouter();
  const [value, setValue] = React.useState<ProgressStatus>(initialStatus);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(initialStatus);
  }, [initialStatus]);

  const onChange = async (next: ProgressStatus) => {
    setBusy(true);
    setError(null);
    setValue(next);
    try {
      const body: Record<string, unknown> = { status: next };
      if (bookFormat === "epub") {
        if (next === "finished") body.progress = 1;
        else if (next === "not_started" || next === "abandoned") body.progress = 0;
      }
      const res = await fetch(`/api/progress/${bookId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err?.error === "string" ? err.error : "Mise à jour impossible";
        throw new Error(msg);
      }
      router.refresh();
    } catch (e) {
      setValue(initialStatus);
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-eleven-muted text-xs">Statut de lecture</div>
      <select
        className="border-input bg-background text-foreground focus-visible:ring-ring h-9 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-2 disabled:opacity-50"
        value={value}
        disabled={busy}
        aria-busy={busy}
        onChange={(e) => void onChange(e.target.value as ProgressStatus)}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
