import Link from "next/link";
import { BookOpen, Files, HardDrive, PieChart, Scaling } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import styles from "./admin-storage.module.css";

export type StorageMimeBreakdownRow = {
  label: string;
  fileCount: number;
  bytesLabel: string;
  percentOfVolume: number;
};

export type StorageDashboardProps = {
  totalBytesLabel: string;
  fileCount: number;
  bookCount: number;
  booksWithFilesCount: number;
  avgBytesLabel: string;
  mimeBreakdown: StorageMimeBreakdownRow[];
};

const enter = "animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none";

function KpiCard({
  className,
  delayClass,
  icon: Icon,
  label,
  value,
  hint,
}: {
  className?: string;
  delayClass: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  hint: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "gap-0 p-0",
        "motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.25,1,0.5,1)]",
        "motion-safe:hover:-translate-y-px motion-safe:hover:shadow-md",
        "motion-safe:active:translate-y-0",
        enter,
        delayClass,
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="eleven-surface-stone flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-[var(--eleven-border-subtle)]"
          aria-hidden
        >
          <Icon className="text-foreground size-5 opacity-80" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">
            {label}
          </div>
          <div className="eleven-display-section mt-1 text-2xl tracking-tight">{value}</div>
          <div className="text-eleven-muted eleven-body-airy mt-2 text-sm">{hint}</div>
        </div>
      </div>
    </Card>
  );
}

export function StorageDashboard({
  totalBytesLabel,
  fileCount,
  bookCount,
  booksWithFilesCount,
  avgBytesLabel,
  mimeBreakdown,
}: StorageDashboardProps) {
  const coveragePercent =
    bookCount > 0 ? Math.round((booksWithFilesCount / bookCount) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className={cn(enter, "delay-0")}>
        <h2 id="admin-storage-heading" className="eleven-display-section text-2xl sm:text-3xl">
          Stockage
        </h2>
        <p className="text-eleven-secondary eleven-body-airy mt-2 max-w-2xl text-base">
          Statistiques agrégées des fichiers enregistrés dans la table{" "}
          <code className="font-mono text-sm">book_files</code> (chemins et tailles côté
          application). L’espace disque réel dépend du backend de stockage configuré.
        </p>
      </header>

      <section aria-labelledby="admin-storage-kpis-heading">
        <h3 id="admin-storage-kpis-heading" className="sr-only">
          Indicateurs clés
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <KpiCard
            delayClass="delay-75"
            icon={HardDrive}
            label="Volume total"
            value={totalBytesLabel}
            hint={
              <>
                {fileCount} fichier{fileCount === 1 ? "" : "s"} référencé
                {fileCount === 1 ? "" : "s"}
              </>
            }
          />
          <KpiCard
            delayClass="delay-150"
            icon={Files}
            label="Fichiers"
            value={String(fileCount)}
            hint={<>Enregistrements dans book_files</>}
          />
          <KpiCard
            delayClass="delay-200"
            icon={BookOpen}
            label="Livres actifs"
            value={String(bookCount)}
            hint={
              <>
                Entrées <code className="font-mono text-xs">books</code> non supprimées
              </>
            }
          />
          <KpiCard
            delayClass="delay-300"
            icon={Scaling}
            label="Taille moyenne"
            value={avgBytesLabel}
            hint={fileCount > 0 ? <>Par fichier (moyenne arithmétique)</> : <>Aucun fichier</>}
          />
        </div>
      </section>

      <section aria-labelledby="admin-storage-coverage-heading">
        <Card
          className={cn(
            "gap-0 p-0",
            enter,
            "delay-500",
            "motion-safe:transition-[box-shadow,transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.25,1,0.5,1)]",
            "motion-safe:hover:-translate-y-px motion-safe:hover:shadow-md",
          )}
        >
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3
                id="admin-storage-coverage-heading"
                className="eleven-display-section text-lg tracking-tight"
              >
                Couverture fichiers
              </h3>
              <Link
                href="/admin/books"
                className="text-eleven-muted eleven-body-airy hover:text-foreground text-sm underline decoration-[var(--eleven-border-subtle)] underline-offset-4 transition-colors"
              >
                Voir les livres
              </Link>
            </div>
            <p className="text-eleven-secondary eleven-body-airy mt-2 text-sm">
              Livres actifs ayant au moins un fichier attaché, par rapport au total des livres
              actifs.
            </p>
            <div className="mt-4 flex flex-wrap items-baseline gap-2">
              <span className="eleven-display-section text-3xl">{booksWithFilesCount}</span>
              <span className="text-eleven-muted text-sm"> / {bookCount}</span>
              <span className="text-eleven-muted eleven-body-airy text-sm">
                ({bookCount > 0 ? `${coveragePercent} %` : "—"})
              </span>
            </div>
            <div
              className="mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-[var(--eleven-border-subtle)]"
              role="presentation"
              aria-hidden
            >
              <div
                className="bg-foreground h-full rounded-full opacity-90 motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
                style={{ width: `${bookCount > 0 ? Math.min(100, coveragePercent) : 0}%` }}
              />
            </div>
          </div>
        </Card>
      </section>

      <section aria-labelledby="admin-storage-mime-heading">
        <Card className={cn("gap-0 p-0", enter, "delay-700")}>
          <div className="border-b border-[var(--eleven-border-subtle)] px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2">
              <PieChart className="text-eleven-muted size-5 shrink-0" aria-hidden />
              <h3
                id="admin-storage-mime-heading"
                className="eleven-display-section text-lg tracking-tight"
              >
                Répartition par type MIME
              </h3>
            </div>
            <p className="text-eleven-muted eleven-body-airy mt-1 text-sm">
              Part du volume total par type ; le libellé inclut le nombre de fichiers.
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            {mimeBreakdown.length === 0 ? (
              <p className="text-eleven-muted text-sm">Aucun fichier en base.</p>
            ) : (
              <ul className="space-y-4">
                {mimeBreakdown.map((row, index) => (
                  <li key={`${row.label}-${index}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono text-xs break-all text-[var(--eleven-text-secondary)] sm:text-sm">
                        {row.label}
                      </span>
                      <span className="text-eleven-muted eleven-body-airy shrink-0 text-xs sm:text-sm">
                        {row.bytesLabel} · {row.fileCount} fichier{row.fileCount === 1 ? "" : "s"} ·{" "}
                        {row.percentOfVolume} %
                      </span>
                    </div>
                    <div className={cn(styles.barTrack, "mt-2")} aria-hidden>
                      <div
                        className={cn(styles.barFill, styles.barFillMotion)}
                        style={{ width: `${Math.min(100, Math.max(0, row.percentOfVolume))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      <aside
        aria-label="Précisions sur le stockage"
        className={cn(
          "eleven-surface-stone eleven-body-airy rounded-eleven-warm border border-[var(--eleven-border-subtle)] px-4 py-4 text-sm text-[var(--eleven-text-secondary)] shadow-[var(--eleven-shadow-outline)] sm:px-5",
          enter,
          "delay-1000",
        )}
      >
        <strong className="text-foreground font-medium">Note</strong>
        <p className="mt-2">
          Les couvertures et autres assets utilisent d’autres chemins que{" "}
          <code className="font-mono text-xs">book_files</code>. La mesure affichée reflète les
          métadonnées en base, pas un inventaire disque ou bucket S3/MinIO.
        </p>
      </aside>
    </div>
  );
}
