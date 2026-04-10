"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertCircleIcon,
  BanIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  Loader2Icon,
  ListOrderedIcon,
  MoreHorizontalIcon,
  OctagonAlertIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PullItem = {
  status: "created" | "skipped";
  title: string;
  authors: string[];
  open_library_id: string | null;
  isbn_13: string | null;
};

type PullJob = {
  id: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  processedCandidates: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  cancelRequestedAt: string | null;
};

type PullJobDetail = {
  job: PullJob & {
    items: PullItem[];
  };
};

function isJobActive(status: string) {
  return status === "queued" || status === "running";
}

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return dateTimeFormatter.format(new Date(iso));
  } catch {
    return "—";
  }
}

function JobStatusDisplay({ status }: { status: string }) {
  const iconClass = "size-4 shrink-0";
  switch (status) {
    case "running":
      return (
        <span className="inline-flex items-center gap-2">
          <Loader2Icon className={`${iconClass} text-emerald-600 animate-spin`} aria-hidden />
          <span>{status}</span>
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center gap-2">
          <ListOrderedIcon className={`${iconClass} text-amber-600`} aria-hidden />
          <span>{status}</span>
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-2">
          <BanIcon className={`${iconClass} text-stone-500`} aria-hidden />
          <span>{status}</span>
        </span>
      );
    case "succeeded":
      return (
        <span className="inline-flex items-center gap-2">
          <CheckCircle2Icon className={`${iconClass} text-emerald-600`} aria-hidden />
          <span>{status}</span>
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-2">
          <AlertCircleIcon className={`${iconClass} text-red-600`} aria-hidden />
          <span>{status}</span>
        </span>
      );
    case "dead_letter":
      return (
        <span className="inline-flex items-center gap-2">
          <OctagonAlertIcon className={`${iconClass} text-orange-700`} aria-hidden />
          <span>{status}</span>
        </span>
      );
    default:
      return <span>{status}</span>;
  }
}

export function AdminPullBooksClient() {
  const [query, setQuery] = useState("");
  const [chunkSize, setChunkSize] = useState(20);
  const [dryRun, setDryRun] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [jobs, setJobs] = useState<PullJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<PullJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobsInitialLoadDone, setJobsInitialLoadDone] = useState(false);
  const selectedJobIdRef = useRef<string | null>(null);
  selectedJobIdRef.current = selectedJob?.job.id ?? null;
  const hasQuery = query.trim().length > 0;
  const effectiveChunkSize = useMemo(
    () => Math.max(1, Math.min(50, Math.trunc(chunkSize || 20))),
    [chunkSize],
  );
  const hasActiveJobs = useMemo(() => jobs.some((j) => isJobActive(j.status)), [jobs]);

  const reloadJobs = useCallback(async (): Promise<PullJob[]> => {
    const res = await fetch("/api/admin/pull-books/jobs?limit=25", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { jobs?: PullJob[]; error?: string };
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    const list = json.jobs ?? [];
    setJobs(list);
    return list;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await reloadJobs();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur au chargement des jobs");
      } finally {
        setJobsInitialLoadDone(true);
      }
    })();
  }, [reloadJobs]);

  const loadDetail = useCallback(async (jobId: string) => {
    const res = await fetch(`/api/admin/pull-books/jobs/${jobId}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      job?: PullJobDetail["job"];
      error?: string;
    };
    if (!res.ok || !json.job) throw new Error(json.error || `Erreur ${res.status}`);
    setSelectedJob({ job: json.job });
  }, []);

  useEffect(() => {
    const active = jobs.some((j) => isJobActive(j.status));
    if (!active) return;
    const id = window.setInterval(() => {
      void (async () => {
        if (document.visibilityState === "hidden") return;
        try {
          const list = await reloadJobs();
          const sid = selectedJobIdRef.current;
          if (sid) {
            const row = list.find((j) => j.id === sid);
            if (row && isJobActive(row.status)) {
              await loadDetail(sid);
            }
          }
        } catch {
          // Ignore background poll errors
        }
      })();
    }, 2500);
    return () => clearInterval(id);
  }, [jobs, reloadJobs, loadDetail]);

  const runPull = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const body = {
        source: "openlibrary" as const,
        query: query.trim(),
        chunkSize: effectiveChunkSize,
        dryRun,
        maxAttempts: Math.max(1, Math.min(5, Math.trunc(maxAttempts || 3))),
      };

      const res = await fetch("/api/admin/pull-books", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        jobId?: string;
      };

      if (!res.ok) {
        setError(json.error || `Erreur ${res.status}`);
        return;
      }

      await reloadJobs();
      if (json.jobId) {
        await loadDetail(json.jobId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }, [query, effectiveChunkSize, dryRun, maxAttempts, reloadJobs, loadDetail]);

  const requestJobAction = useCallback(
    async (jobId: string, action: "cancel" | "retry") => {
      setError(null);
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/pull-books/jobs/${jobId}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ action }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || `Erreur ${res.status}`);
        }
        await reloadJobs();
        await loadDetail(jobId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
      } finally {
        setBusy(false);
      }
    },
    [loadDetail, reloadJobs],
  );

  const deleteJob = useCallback(
    async (jobId: string) => {
      if (!window.confirm("Supprimer définitivement ce job et son rapport d’exécution ?")) {
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/pull-books/jobs/${jobId}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || `Erreur ${res.status}`);
        }
        setSelectedJob((prev) => (prev?.job.id === jobId ? null : prev));
        await reloadJobs();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
      } finally {
        setBusy(false);
      }
    },
    [reloadJobs],
  );

  const exportSelectedCsv = useCallback(() => {
    if (!selectedJob) return;
    const rows = [
      ["status", "title", "authors", "open_library_id", "isbn_13"],
      ...selectedJob.job.items.map((it) => [
        it.status,
        it.title,
        it.authors.join(", "),
        it.open_library_id ?? "",
        it.isbn_13 ?? "",
      ]),
    ];
    const csv = rows
      .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pull-books-job-${selectedJob.job.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedJob]);

  const selectJobRow = useCallback(
    (jobId: string) => {
      void (async () => {
        try {
          setError(null);
          await loadDetail(jobId);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur réseau");
        }
      })();
    },
    [loadDetail],
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(280px,380px)_1fr] lg:items-start xl:grid-cols-[380px_1fr]">
      {/* Form column */}
      <aside
        className="pull-books-panel-enter space-y-4 lg:sticky lg:top-24"
        style={{ "--pull-books-panel-delay": "40ms" } as CSSProperties}
      >
        <div className="shadow-eleven-card space-y-5 rounded-2xl border border-(--eleven-border-subtle) bg-card p-6">
          <div className="space-y-2">
            <label htmlFor="pull-query" className="text-eleven-muted text-xs font-medium uppercase">
              Requête Open Library
            </label>
            <Input
              id="pull-query"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Ex. bible, science fiction…"
              disabled={busy}
              className="eleven-body-airy h-11 rounded-xl border-(--eleven-border-subtle) shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.06)] transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:transition-none"
            />
          </div>

          <details className="group rounded-xl border border-(--eleven-border-subtle) bg-muted/20 open:bg-muted/30">
            <summary className="eleven-body-airy flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
              Options avancées
              <ChevronDownIcon className="text-eleven-muted size-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-(--eleven-border-subtle) space-y-4 px-4 py-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <label htmlFor="pull-limit" className="text-eleven-muted text-xs">
                    Chunk size (1–50)
                  </label>
                  <Input
                    id="pull-limit"
                    type="number"
                    min={1}
                    max={50}
                    value={chunkSize}
                    onChange={(e) => {
                      setChunkSize(Number(e.target.value) || 20);
                    }}
                    disabled={busy}
                    className="eleven-body-airy w-24 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pull-attempts" className="text-eleven-muted text-xs">
                    Max attempts (1–5)
                  </label>
                  <Input
                    id="pull-attempts"
                    type="number"
                    min={1}
                    max={5}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value) || 3)}
                    disabled={busy}
                    className="eleven-body-airy w-24 rounded-xl"
                  />
                </div>
              </div>
              <label className="eleven-body-airy flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  id="pull-dry-run"
                  checked={dryRun}
                  onChange={(e) => {
                    setDryRun(e.target.checked);
                  }}
                  disabled={busy}
                  className="size-4 rounded border"
                />
                Dry-run (aucune écriture)
              </label>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !hasQuery}
              className="rounded-eleven-pill transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              onClick={() => void runPull()}
            >
              Créer un job de pull
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              className="rounded-eleven-pill transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              onClick={() => {
                void (async () => {
                  try {
                    setError(null);
                    await reloadJobs();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Erreur réseau");
                  }
                })();
              }}
            >
              <RefreshCwIcon className="mr-1.5 size-4" aria-hidden />
              Rafraîchir les jobs
            </Button>
          </div>
        </div>
      </aside>

      {/* Jobs + detail */}
      <div className="min-w-0 space-y-6">
        {error ? (
          <div
            className="text-destructive rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm dark:border-red-900/50 dark:bg-red-950/35"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <section
          className="pull-books-panel-enter shadow-eleven-card rounded-2xl border border-(--eleven-border-subtle) bg-card"
          style={{ "--pull-books-panel-delay": "80ms" } as CSSProperties}
          aria-labelledby="pull-books-jobs-heading"
        >
          <div className="flex flex-col gap-3 border-b border-(--eleven-border-subtle) px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h3
                id="pull-books-jobs-heading"
                className="eleven-display-section text-foreground text-xl tracking-tight"
              >
                Jobs récents
              </h3>
              <p className="text-eleven-muted eleven-body-airy mt-0.5 text-xs">
                {jobsInitialLoadDone ? `${jobs.length} affiché(s) (max 25)` : "Chargement…"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {hasActiveJobs ? (
                <>
                  <span className="text-eleven-muted inline-flex items-center gap-1.5 text-xs">
                    <span
                      className="bg-emerald-500/90 size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
                      aria-hidden
                    />
                    Actualisation automatique
                  </span>
                  <span className="sr-only" aria-live="polite">
                    Les jobs actifs sont actualisés automatiquement toutes les quelques secondes.
                  </span>
                </>
              ) : null}
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {!jobsInitialLoadDone ? (
              <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Chargement des jobs…</span>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="pull-books-skeleton-stagger bg-muted/80 h-14 rounded-xl"
                    style={
                      {
                        "--pull-books-skeleton-delay": `${i * 70}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            ) : jobs.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-(--eleven-border-subtle)">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-eleven-muted text-xs tracking-wide uppercase">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Job</th>
                      <th className="px-3 py-2.5 font-medium">Statut</th>
                      <th className="px-3 py-2.5 font-medium">Progression</th>
                      <th className="px-3 py-2.5 font-medium">Résultat</th>
                      <th className="px-3 py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job, index) => {
                      const selected = selectedJob?.job.id === job.id;
                      const rowDelay = `${Math.min(index, 8) * 45}ms`;
                      return (
                        <tr
                          key={job.id}
                          tabIndex={0}
                          aria-current={selected ? "true" : undefined}
                          className={cn(
                            "pull-books-row-enter border-t border-(--eleven-border-subtle) transition-[background-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                            "cursor-pointer hover:bg-muted/35",
                            selected && "bg-muted/45 shadow-[inset_3px_0_0_0_var(--ring)]",
                          )}
                          style={{ "--pull-books-row-delay": rowDelay } as CSSProperties}
                          onClick={() => selectJobRow(job.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectJobRow(job.id);
                            }
                          }}
                        >
                          <td className="text-eleven-secondary px-3 py-2.5 font-mono text-xs">
                            {job.id.slice(0, 8)}…
                          </td>
                          <td className="px-3 py-2.5">
                            <JobStatusDisplay status={job.status} />
                          </td>
                          <td className="text-eleven-secondary eleven-body-airy px-3 py-2.5">
                            {job.processedCandidates} candidats
                          </td>
                          <td className="text-eleven-secondary eleven-body-airy px-3 py-2.5 text-xs leading-relaxed">
                            <span className="text-foreground font-medium">{job.createdCount}</span>{" "}
                            créés ·{" "}
                            <span className="text-foreground font-medium">{job.skippedCount}</span>{" "}
                            ignorés ·{" "}
                            <span className="text-foreground font-medium">{job.errorCount}</span>{" "}
                            erreurs
                          </td>
                          <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="rounded-eleven-pill"
                                onClick={() => void loadDetail(job.id)}
                              >
                                Détail
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="rounded-eleven-pill size-8 p-0"
                                    aria-label={`Actions pour le job ${job.id.slice(0, 8)}`}
                                    disabled={busy}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontalIcon className="size-4" aria-hidden />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-44">
                                  <DropdownMenuItem
                                    disabled={
                                      busy || (job.status !== "queued" && job.status !== "running")
                                    }
                                    onSelect={() => void requestJobAction(job.id, "cancel")}
                                  >
                                    Annuler le job
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={
                                      busy ||
                                      (job.status !== "failed" &&
                                        job.status !== "dead_letter" &&
                                        job.status !== "cancelled")
                                    }
                                    onSelect={() => void requestJobAction(job.id, "retry")}
                                  >
                                    Rejouer le job
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={busy || job.status === "running"}
                                    onSelect={() => void deleteJob(job.id)}
                                  >
                                    <Trash2Icon className="size-4" aria-hidden />
                                    Supprimer…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-(--eleven-border-subtle) bg-muted/15 px-4 py-12 text-center">
                <p className="text-eleven-secondary eleven-body-airy text-sm">
                  Aucun job pull-books pour le moment.
                </p>
                <p className="text-eleven-muted eleven-body-airy mt-2 text-xs">
                  Saisissez une requête et lancez un job pour importer des métadonnées depuis Open
                  Library.
                </p>
              </div>
            )}
          </div>
        </section>

        {selectedJob ? (
          <section
            className="pull-books-detail-enter shadow-eleven-card rounded-2xl border border-(--eleven-border-subtle) bg-card"
            aria-labelledby="pull-books-detail-heading"
          >
            <div className="flex flex-col gap-4 border-b border-(--eleven-border-subtle) px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 space-y-2">
                <h3
                  id="pull-books-detail-heading"
                  className="eleven-display-section text-foreground text-lg tracking-tight"
                >
                  Détail du job
                </h3>
                <p className="text-eleven-muted font-mono text-xs break-all">{selectedJob.job.id}</p>
                <div className="text-sm">
                  <JobStatusDisplay status={selectedJob.job.status} />
                </div>
                <dl className="text-eleven-secondary eleven-body-airy grid max-w-xl grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-eleven-muted">Créé</dt>
                    <dd>{formatDateTime(selectedJob.job.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-eleven-muted">Mis à jour</dt>
                    <dd>{formatDateTime(selectedJob.job.updatedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-eleven-muted">Terminé</dt>
                    <dd>{formatDateTime(selectedJob.job.finishedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:block">
                    <dt className="text-eleven-muted">Tentatives</dt>
                    <dd>
                      {selectedJob.job.attempts} / {selectedJob.job.maxAttempts}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 sm:col-span-2 sm:block">
                    <dt className="text-eleven-muted">Compteurs</dt>
                    <dd>
                      {selectedJob.job.createdCount} créés, {selectedJob.job.skippedCount} ignorés,{" "}
                      {selectedJob.job.errorCount} erreurs, {selectedJob.job.processedCandidates}{" "}
                      candidats traités
                    </dd>
                  </div>
                </dl>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="rounded-eleven-pill shrink-0 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                onClick={exportSelectedCsv}
              >
                Export CSV
              </Button>
            </div>
            <div className="max-h-[min(28rem,55vh)] overflow-auto rounded-xl border border-(--eleven-border-subtle) p-4 sm:p-5">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-muted/50 text-eleven-muted sticky top-0 z-[1] text-xs tracking-wide uppercase backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Statut</th>
                    <th className="px-3 py-2.5 font-medium">Titre</th>
                    <th className="px-3 py-2.5 font-medium">Auteurs</th>
                    <th className="px-3 py-2.5 font-medium">OL ID</th>
                    <th className="px-3 py-2.5 font-medium">ISBN-13</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedJob.job.items.map((it, i) => (
                    <tr
                      key={`${it.open_library_id ?? it.title}-${i}`}
                      className="border-t border-(--eleven-border-subtle) transition-colors duration-150 hover:bg-muted/25 motion-reduce:transition-none"
                    >
                      <td className="px-3 py-2">{it.status}</td>
                      <td className="eleven-body-airy px-3 py-2">{it.title}</td>
                      <td className="eleven-body-airy text-eleven-secondary px-3 py-2">
                        {it.authors.join(", ")}
                      </td>
                      <td className="text-eleven-muted px-3 py-2 font-mono text-xs">
                        {it.open_library_id ?? "—"}
                      </td>
                      <td className="text-eleven-muted px-3 py-2 font-mono text-xs">
                        {it.isbn_13 ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
