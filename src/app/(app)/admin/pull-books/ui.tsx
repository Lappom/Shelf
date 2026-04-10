"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function AdminPullBooksClient() {
  const [query, setQuery] = useState("");
  const [chunkSize, setChunkSize] = useState(20);
  const [dryRun, setDryRun] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [jobs, setJobs] = useState<PullJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<PullJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasQuery = query.trim().length > 0;
  const effectiveChunkSize = useMemo(
    () => Math.max(1, Math.min(50, Math.trunc(chunkSize || 20))),
    [chunkSize],
  );

  const reloadJobs = useCallback(async () => {
    const res = await fetch("/api/admin/pull-books/jobs?limit=25", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { jobs?: PullJob[]; error?: string };
    if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
    setJobs(json.jobs ?? []);
  }, []);

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
        const res = await fetch(`/api/admin/pull-books/jobs/${jobId}/${action}`, {
          method: "POST",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
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

  return (
    <div className="space-y-6">
      <div className="shadow-eleven-card grid max-w-xl gap-4 rounded-2xl border border-black/5 bg-white p-6">
        <div className="space-y-2">
          <label htmlFor="pull-query" className="text-sm font-medium">
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
            className="rounded-xl"
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label htmlFor="pull-limit" className="text-sm font-medium">
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
              className="w-24 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="pull-attempts" className="text-sm font-medium">
              Max attempts (1-5)
            </label>
            <Input
              id="pull-attempts"
              type="number"
              min={1}
              max={5}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value) || 3)}
              disabled={busy}
              className="w-24 rounded-xl"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || !hasQuery}
            className="rounded-eleven-pill"
            onClick={() => void runPull()}
          >
            Créer un job de pull
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void reloadJobs()}
          >
            Rafraîchir les jobs
          </Button>
        </div>
      </div>

      {error ? (
        <div className="text-destructive rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-black/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Progression</th>
                  <th className="px-3 py-2">Résultat</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-black/5">
                    <td className="px-3 py-2 font-mono text-xs">{job.id.slice(0, 8)}...</td>
                    <td className="px-3 py-2">{job.status}</td>
                    <td className="px-3 py-2">{job.processedCandidates} candidats</td>
                    <td className="px-3 py-2">
                      +{job.createdCount} / ={job.skippedCount} / !{job.errorCount}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void loadDetail(job.id)}
                        >
                          Détail
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy || (job.status !== "queued" && job.status !== "running")}
                          onClick={() => void requestJobAction(job.id, "cancel")}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={
                            busy ||
                            (job.status !== "failed" &&
                              job.status !== "dead_letter" &&
                              job.status !== "cancelled")
                          }
                          onClick={() => void requestJobAction(job.id, "retry")}
                        >
                          Retry
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {selectedJob ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Job {selectedJob.job.id} · {selectedJob.job.status}
            </p>
            <Button type="button" variant="secondary" onClick={exportSelectedCsv}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-black/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Titre</th>
                  <th className="px-3 py-2">Auteurs</th>
                  <th className="px-3 py-2">OL ID</th>
                  <th className="px-3 py-2">ISBN-13</th>
                </tr>
              </thead>
              <tbody>
                {selectedJob.job.items.map((it, i) => (
                  <tr
                    key={`${it.open_library_id ?? it.title}-${i}`}
                    className="border-t border-black/5"
                  >
                    <td className="px-3 py-2">{it.status}</td>
                    <td className="px-3 py-2">{it.title}</td>
                    <td className="px-3 py-2">{it.authors.join(", ")}</td>
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {it.open_library_id ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {it.isbn_13 ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
