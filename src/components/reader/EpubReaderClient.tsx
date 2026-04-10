"use client";

import * as React from "react";
import ePub, { type Book, type Rendition } from "epubjs";
import sanitizeHtml from "sanitize-html";
import { useRouter } from "next/navigation";
import {
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HardDriveIcon,
  ListIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateReaderPreferencesAction } from "@/app/(app)/reader/[id]/actions";
import { ensureEpubCachedAndIndexed } from "@/lib/offline/epubIndex";
import {
  flushOfflineQueue,
  offlineOrQueueAnnotationCreate,
  offlineOrQueueAnnotationDelete,
  offlineOrQueueAnnotationPatch,
  offlineOrQueueProgress,
} from "@/lib/offline/queue";
import { OfflineManagerDialog } from "@/components/pwa/OfflineManagerDialog";
import { ReaderAnnotationsList } from "@/components/reader/ReaderAnnotationsList";
import { ReaderSettingsDialog } from "@/components/reader/ReaderSettingsDialog";
import { ReaderTocList } from "@/components/reader/ReaderTocList";
import { cn } from "@/lib/utils";

type ReaderPrefs = {
  readerFontFamily: string | null;
  readerFontSize: number | null;
  readerLineHeight: number | null;
  readerMargin: number | null;
  readerTheme: "light" | "dark" | "sepia" | null;
  readerFlow: "paginated" | "scrolled" | null;
};

type ProgressRow = {
  progress: number;
  currentCfi: string | null;
  currentPage: number | null;
  status: "not_started" | "reading" | "finished" | "abandoned";
  updatedAt: string | Date | null;
} | null;

type AnnotationRow = {
  id: string;
  type: "highlight" | "note" | "bookmark";
  cfiRange: string;
  content: string | null;
  note: string | null;
  color: string | null;
};

type TocItem = { href: string; label: string; subitems?: TocItem[] };

type Props = {
  bookId: string;
  fileUrl: string;
  bookTitle: string;
  bookAuthors: string[];
  initialPrefs: ReaderPrefs | null;
  initialProgress: ProgressRow;
  initialAnnotations: AnnotationRow[];
};

function flattenToc(
  items: TocItem[],
  depth = 0,
): Array<{ href: string; label: string; depth: number }> {
  const out: Array<{ href: string; label: string; depth: number }> = [];
  for (const it of items) {
    out.push({ href: it.href, label: it.label, depth });
    if (it.subitems?.length) out.push(...flattenToc(it.subitems, depth + 1));
  }
  return out;
}

function clampNumber(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function formatPercent(p: number | null) {
  if (p == null || !Number.isFinite(p)) return "—";
  const x = Math.round(clampNumber(p, 0, 1) * 1000) / 10;
  return `${x.toFixed(1)}%`;
}

export function EpubReaderClient({
  bookId,
  fileUrl,
  bookTitle,
  bookAuthors,
  initialPrefs,
  initialProgress,
  initialAnnotations,
}: Props) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const bookRef = React.useRef<Book | null>(null);
  const renditionRef = React.useRef<Rendition | null>(null);

  const [toc, setToc] = React.useState<Array<{ href: string; label: string; depth: number }>>([]);
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [focusMode, setFocusMode] = React.useState(false);
  const [busy, startTransition] = React.useTransition();
  const [offlineDialogOpen, setOfflineDialogOpen] = React.useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = React.useState(false);

  const [prefs, setPrefs] = React.useState(() => ({
    readerFontFamily: initialPrefs?.readerFontFamily ?? "system",
    readerFontSize: initialPrefs?.readerFontSize ?? 18,
    readerLineHeight: initialPrefs?.readerLineHeight ?? 1.6,
    readerMargin: initialPrefs?.readerMargin ?? 24,
    readerTheme: initialPrefs?.readerTheme ?? "light",
    readerFlow: initialPrefs?.readerFlow ?? "paginated",
  }));

  const [annotations, setAnnotations] = React.useState<AnnotationRow[]>(initialAnnotations);
  const [location, setLocation] = React.useState<{ cfi: string | null; progress: number | null }>({
    cfi: initialProgress?.currentCfi ?? null,
    progress: typeof initialProgress?.progress === "number" ? initialProgress.progress : null,
  });

  const [selectionDialogOpen, setSelectionDialogOpen] = React.useState(false);
  const [pendingSelection, setPendingSelection] = React.useState<{
    cfiRange: string;
    text: string;
    color: string;
    note: string;
  } | null>(null);

  const sanitizedFileUrl = React.useMemo(() => fileUrl, [fileUrl]);

  React.useEffect(() => {
    // Auto-cache the EPUB on first read (best-effort).
    void ensureEpubCachedAndIndexed({ bookId, fileUrl: sanitizedFileUrl }).catch(() => undefined);
  }, [bookId, sanitizedFileUrl]);

  React.useEffect(() => {
    const onOnline = () => {
      void flushOfflineQueue().catch(() => undefined);
    };
    window.addEventListener("online", onOnline);
    void flushOfflineQueue().catch(() => undefined);
    const interval = window.setInterval(() => {
      void flushOfflineQueue().catch(() => undefined);
    }, 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (leftOpen) {
          setLeftOpen(false);
          return;
        }
        if (rightOpen) {
          setRightOpen(false);
          return;
        }
        setFocusMode(false);
      }
      if (e.key.toLowerCase?.() === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setFocusMode((v) => {
          const next = !v;
          if (next) {
            setLeftOpen(false);
            setRightOpen(false);
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leftOpen, rightOpen]);

  const saveProgress = React.useCallback(
    async (opts?: { bestEffort?: boolean }) => {
      const cfi = location.cfi;
      const progress = location.progress;
      if (!cfi) return;
      try {
        await offlineOrQueueProgress({
          bookId,
          url: `/api/progress/${bookId}`,
          body: {
            currentCfi: cfi,
            status: "reading",
            clientNow: new Date().toISOString(),
            ...(typeof progress === "number" ? { progress: clampNumber(progress, 0, 1) } : {}),
          },
        });
      } catch {
        if (!opts?.bestEffort) throw new Error("SAVE_FAILED");
      }
    },
    [bookId, location.cfi, location.progress],
  );

  const refreshAnnotations = React.useCallback(async () => {
    const res = await fetch(`/api/books/${bookId}/annotations`, { method: "GET" });
    if (!res.ok) return;
    const json = (await res.json()) as { annotations?: AnnotationRow[] };
    if (Array.isArray(json.annotations)) setAnnotations(json.annotations);
  }, [bookId]);

  const applyThemeAndTypography = React.useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    const fontFamily =
      prefs.readerFontFamily === "serif"
        ? `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
        : prefs.readerFontFamily === "sans"
          ? `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`
          : prefs.readerFontFamily === "dyslexic"
            ? `OpenDyslexic, ui-sans-serif, system-ui, Segoe UI, sans-serif`
            : `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"`;

    const bg =
      prefs.readerTheme === "dark"
        ? "#0b0b0b"
        : prefs.readerTheme === "sepia"
          ? "#f5f2ef"
          : "#ffffff";
    const fg = prefs.readerTheme === "dark" ? "#f5f5f5" : "#111111";

    try {
      rendition.themes.default({
        body: {
          "font-family": fontFamily,
          "font-size": `${clampNumber(prefs.readerFontSize, 12, 32)}px`,
          "line-height": String(clampNumber(prefs.readerLineHeight, 1.0, 2.5)),
          "padding-left": `${clampNumber(prefs.readerMargin, 0, 80)}px`,
          "padding-right": `${clampNumber(prefs.readerMargin, 0, 80)}px`,
          background: bg,
          color: fg,
        },
        a: { color: fg },
      });
      rendition.themes.select("default");
    } catch {
      // Theme application is best-effort; rendering must keep working.
    }

    try {
      if (prefs.readerFlow === "scrolled") rendition.flow("scrolled");
      else rendition.flow("paginated");
    } catch {
      // Some EPUBs/layouts may not support flow switching reliably.
    }
  }, [
    prefs.readerFlow,
    prefs.readerFontFamily,
    prefs.readerFontSize,
    prefs.readerLineHeight,
    prefs.readerMargin,
    prefs.readerTheme,
  ]);

  const applyHighlights = React.useCallback(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;

    for (const a of annotations) {
      if (a.type !== "highlight") continue;
      try {
        // Ensure idempotency by removing and re-adding.
        rendition.annotations.remove(a.cfiRange, "highlight");
      } catch {
        // ignore
      }
      try {
        rendition.annotations.highlight(a.cfiRange, {}, () => undefined, "shelf-highlight", {
          fill: a.color ?? "#ffee55",
          "fill-opacity": "0.35",
          "mix-blend-mode": "multiply",
        });
      } catch {
        // ignore
      }
    }
  }, [annotations]);

  React.useEffect(() => {
    if (!containerRef.current) return;

    // Force epub.js to treat the URL as an archived EPUB, even if it doesn't end with ".epub".
    const book = ePub(sanitizedFileUrl, { openAs: "epub" });
    bookRef.current = book;

    const rendition = book.renderTo(containerRef.current, {
      width: "100%",
      height: "100%",
      spread: "none",
      flow: prefs.readerFlow === "scrolled" ? "scrolled" : "paginated",
    });
    renditionRef.current = rendition;

    // Defense-in-depth: sanitize any HTML content as it enters the iframe.
    rendition.hooks.content.register((contents: { document: Document }) => {
      try {
        const doc = contents.document as Document;
        const body = doc.body;
        const clean = sanitizeHtml(body.innerHTML, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            "img",
            "blockquote",
            "pre",
            "code",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            "caption",
            "colgroup",
            "col",
            "hr",
            "cite",
            "abbr",
            "sup",
            "sub",
          ]),
          disallowedTagsMode: "discard",
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            "*": ["class", "id", "lang", "dir", "title", "role", "aria-label", "aria-hidden"],
            a: ["href", "name", "target", "rel"],
            img: ["src", "alt", "title", "width", "height"],
            th: ["colspan", "rowspan", "scope"],
            td: ["colspan", "rowspan"],
            col: ["span"],
            colgroup: ["span"],
            abbr: ["title"],
          },
          allowedSchemes: ["http", "https", "mailto", "tel", "blob"],
          allowProtocolRelative: false,
          transformTags: {
            a: (tagName, attribs) => {
              const next = { ...attribs };
              const target = (next.target ?? "").toString().toLowerCase();
              if (target === "_blank") {
                const rel = (next.rel ?? "").toString();
                const tokens = new Set(rel.split(/\s+/g).filter(Boolean));
                tokens.add("noopener");
                tokens.add("noreferrer");
                next.rel = Array.from(tokens).join(" ");
              }
              return { tagName, attribs: next };
            },
          },
        });
        body.innerHTML = clean;
      } catch {
        // If sanitization fails, leave content as-is; rendering must not break.
      }
    });

    const onRelocated = (loc: unknown) => {
      const anyLoc = loc as { start?: { cfi?: string; percentage?: number } };
      const cfi = anyLoc?.start?.cfi ?? null;
      const pct = typeof anyLoc?.start?.percentage === "number" ? anyLoc.start.percentage : null;
      setLocation({ cfi, progress: pct });
    };

    rendition.on("relocated", onRelocated);

    rendition.on("selected", (cfiRange: string, contents: unknown) => {
      const anyContents = contents as { window?: Window };
      const text = anyContents?.window?.getSelection?.()?.toString?.() ?? "";
      setPendingSelection({
        cfiRange,
        text: text.trim().slice(0, 50_000),
        color: "#ffee55",
        note: "",
      });
      setSelectionDialogOpen(true);
      try {
        renditionRef.current?.annotations.remove(cfiRange, "highlight");
      } catch {
        // ignore
      }
    });

    void book.loaded?.navigation
      ?.then((nav: unknown) => {
        const anyNav = nav as { toc?: TocItem[] };
        const items = Array.isArray(anyNav.toc) ? anyNav.toc : [];
        setToc(flattenToc(items));
      })
      .catch(() => undefined);

    void book.ready
      .then(async () => {
        applyThemeAndTypography();
        if (location.cfi) {
          try {
            await rendition.display(location.cfi);
          } catch {
            await rendition.display();
          }
        } else {
          await rendition.display();
        }
      })
      .then(() => {
        applyHighlights();
      })
      .catch(() => undefined);

    const interval = window.setInterval(() => {
      startTransition(async () => {
        await saveProgress({ bestEffort: true });
      });
    }, 30_000);

    const onBeforeUnload = () => {
      void saveProgress({ bestEffort: true });
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      try {
        rendition.destroy();
        book.destroy();
      } finally {
        renditionRef.current = null;
        bookRef.current = null;
      }
      void saveProgress({ bestEffort: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanitizedFileUrl, bookId]);

  React.useEffect(() => {
    applyThemeAndTypography();
    applyHighlights();
  }, [applyThemeAndTypography, applyHighlights]);

  const exportMarkdown = React.useCallback(() => {
    const lines: string[] = [];
    lines.push(`# Annotations — ${bookTitle}`);
    if (bookAuthors.length) lines.push(`\n_Auteurs_: ${bookAuthors.join(", ")}\n`);
    lines.push(`\n_Généré le_: ${new Date().toISOString()}\n`);

    for (const a of annotations) {
      if (a.type === "highlight") {
        lines.push(`\n## Highlight ${a.color ? `(${a.color})` : ""}\n`);
        if (a.content) lines.push(`> ${a.content.replace(/\n/g, "\n> ")}\n`);
        if (a.note) lines.push(`\n**Note**: ${a.note}\n`);
      } else if (a.type === "note") {
        lines.push(`\n## Note\n`);
        if (a.note) lines.push(`${a.note}\n`);
      } else {
        lines.push(`\n## Bookmark\n`);
        if (a.note) lines.push(`${a.note}\n`);
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annotations-${bookId}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [annotations, bookAuthors, bookId, bookTitle]);

  const progressPct =
    typeof location.progress === "number" ? clampNumber(location.progress, 0, 1) : null;

  const createBookmark = React.useCallback(async () => {
    const cfi = location.cfi;
    if (!cfi) return;
    const res = await offlineOrQueueAnnotationCreate({
      bookId,
      url: `/api/books/${bookId}/annotations`,
      body: { type: "bookmark", cfiRange: cfi },
    });
    if (!res.queued) await refreshAnnotations();
    if (res.queued) {
      setAnnotations((prev) => [
        ...prev,
        {
          id: `local:${Date.now()}`,
          type: "bookmark",
          cfiRange: cfi,
          content: null,
          note: null,
          color: null,
        },
      ]);
    }
  }, [bookId, location.cfi, refreshAnnotations]);

  const updatePref = React.useCallback(
    (patch: Partial<typeof prefs>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      startTransition(async () => {
        await updateReaderPreferencesAction({
          readerFontFamily: next.readerFontFamily,
          readerFontSize: next.readerFontSize,
          readerLineHeight: next.readerLineHeight,
          readerMargin: next.readerMargin,
          readerTheme: next.readerTheme,
          readerFlow: next.readerFlow,
        });
        router.refresh();
      });
    },
    [prefs, router],
  );

  const createHighlightFromDialog = React.useCallback(async () => {
    if (!pendingSelection) return;
    const res = await offlineOrQueueAnnotationCreate({
      bookId,
      url: `/api/books/${bookId}/annotations`,
      body: {
        type: "highlight",
        cfiRange: pendingSelection.cfiRange,
        content: pendingSelection.text || null,
        note: pendingSelection.note || null,
        color: pendingSelection.color,
      },
    });
    setSelectionDialogOpen(false);
    setPendingSelection(null);
    if (!res.queued) await refreshAnnotations();
    if (res.queued) {
      setAnnotations((prev) => [
        ...prev,
        {
          id: `local:${Date.now()}`,
          type: "highlight",
          cfiRange: pendingSelection.cfiRange,
          content: pendingSelection.text || null,
          note: pendingSelection.note || null,
          color: pendingSelection.color,
        },
      ]);
    }
  }, [bookId, pendingSelection, refreshAnnotations]);

  const navigateToc = React.useCallback(
    (href: string, closeAfter: boolean) => {
      if (closeAfter) setLeftOpen(false);
      startTransition(async () => {
        try {
          await renditionRef.current?.display(href);
        } catch {
          // ignore
        }
      });
    },
    [startTransition],
  );

  const goToAnnotation = React.useCallback(
    (cfiRange: string, closeAfter: boolean) => {
      if (closeAfter) setRightOpen(false);
      startTransition(async () => {
        try {
          await renditionRef.current?.display(cfiRange);
        } catch {
          // ignore
        }
      });
    },
    [startTransition],
  );

  const deleteAnnotation = React.useCallback(
    (a: AnnotationRow) => {
      startTransition(async () => {
        if (a.id.startsWith("local:")) {
          setAnnotations((prev) => prev.filter((x) => x.id !== a.id));
          return;
        }
        const res = await offlineOrQueueAnnotationDelete({
          bookId,
          url: `/api/annotations/${a.id}`,
        });
        if (!res.queued) await refreshAnnotations();
        if (res.queued) setAnnotations((prev) => prev.filter((x) => x.id !== a.id));
      });
    },
    [bookId, refreshAnnotations, startTransition],
  );

  const editAnnotation = React.useCallback((a: AnnotationRow) => {
    setPendingSelection({
      cfiRange: a.cfiRange,
      text: a.content ?? "",
      color: a.color ?? "#ffee55",
      note: a.note ?? "",
    });
    setSelectionDialogOpen(true);
  }, []);

  return (
    <div className="reader-shell-enter relative flex min-h-[calc(100vh-3.5rem)] w-full flex-col bg-background text-foreground">
      {!focusMode ? (
        <header className="shrink-0 border-b border-(--eleven-border-subtle) bg-background/85 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/65">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-eleven-pill shadow-eleven-button-white"
                onClick={() => router.back()}
                title="Retour"
                aria-label="Retour"
                disabled={busy}
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <div className="min-w-0">
                <div className="eleven-display-section text-foreground truncate text-base tracking-tight">
                  {bookTitle}
                </div>
                {bookAuthors.length ? (
                  <div className="text-eleven-muted eleven-body-airy truncate text-xs">
                    {bookAuthors.join(", ")}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className="text-eleven-muted eleven-body-airy hidden text-xs lg:block">
                <span className="text-foreground">{formatPercent(location.progress)}</span>
              </div>

              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-eleven-pill shadow-eleven-button-white"
                onClick={() => setLeftOpen((v) => !v)}
                aria-label="Table des matières"
                title="Table des matières"
                disabled={busy}
              >
                <ListIcon className="size-4" />
              </Button>

              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-eleven-pill shadow-eleven-button-white"
                onClick={() => setRightOpen((v) => !v)}
                aria-label="Annotations"
                title="Annotations"
                disabled={busy}
              >
                <BookmarkIcon className="size-4" />
              </Button>

              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-eleven-pill shadow-eleven-button-white"
                onClick={() => setOfflineDialogOpen(true)}
                aria-label="Stockage et hors-ligne"
                title="Stockage et hors-ligne"
                disabled={busy}
              >
                <HardDriveIcon className="size-4" />
              </Button>

              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-eleven-pill shadow-eleven-button-white"
                onClick={() => setReaderSettingsOpen(true)}
                aria-label="Réglages de lecture"
                title="Réglages de lecture"
                disabled={busy}
              >
                <SlidersHorizontalIcon className="size-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="rounded-eleven-pill shadow-eleven-button-white"
                    aria-label="Menu lecture"
                    title="Menu lecture"
                    disabled={busy}
                  >
                    <SettingsIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="eleven-body-airy">Raccourcis</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="eleven-body-airy"
                    onSelect={(e) => {
                      e.preventDefault();
                      setReaderSettingsOpen(true);
                    }}
                  >
                    Réglages détaillés…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="eleven-body-airy">Thème rapide</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={prefs.readerTheme}
                    onValueChange={(v) =>
                      updatePref({ readerTheme: v as "light" | "dark" | "sepia" })
                    }
                  >
                    <DropdownMenuRadioItem value="light">Clair</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">Sombre</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="sepia">Sepia</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="eleven-body-airy"
                    onSelect={(e) => {
                      e.preventDefault();
                      void createBookmark();
                    }}
                  >
                    Ajouter un signet
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="eleven-body-airy"
                    onSelect={(e) => {
                      e.preventDefault();
                      exportMarkdown();
                    }}
                  >
                    Exporter les annotations (Markdown)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="eleven-body-airy"
                    onSelect={(e) => {
                      e.preventDefault();
                      setFocusMode((v) => {
                        const next = !v;
                        if (next) {
                          setLeftOpen(false);
                          setRightOpen(false);
                        }
                        return next;
                      });
                    }}
                  >
                    Mode focus (Ctrl/Cmd+F)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="bg-muted/80 mt-3 h-1.5 w-full overflow-hidden rounded-eleven-pill">
            <div
              className="bg-foreground/65 h-full rounded-eleven-pill transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round((progressPct ?? 0) * 10000) / 100}%` }}
            />
          </div>
        </header>
      ) : null}

      <div
        className={cn(
          "flex min-h-0 flex-1",
          focusMode && "min-h-[calc(100vh-3.5rem)]",
        )}
      >
        {!focusMode && leftOpen ? (
          <aside className="hidden h-full w-72 shrink-0 flex-col overflow-hidden border-r border-(--eleven-border-subtle) bg-background md:flex">
            <div className="eleven-display-section text-foreground border-b border-(--eleven-border-subtle) px-3 py-3 text-base tracking-tight">
              Chapitres
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <ReaderTocList
                items={toc}
                emptyLabel="Table des matières indisponible."
                onNavigate={(href) => navigateToc(href, false)}
              />
            </div>
          </aside>
        ) : null}

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!focusMode ? (
            <div className="flex items-center justify-between gap-3 border-b border-(--eleven-border-subtle) bg-background/80 px-3 py-2.5 backdrop-blur">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-10 rounded-eleven-pill shadow-eleven-button-white md:size-9"
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await renditionRef.current?.prev();
                      } catch {
                        // ignore
                      }
                    });
                  }}
                  disabled={busy}
                  aria-label="Page précédente"
                  title="Page précédente"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <span className="text-eleven-muted eleven-body-airy hidden text-xs sm:inline">
                  Pages
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-10 rounded-eleven-pill shadow-eleven-button-white md:size-9"
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await renditionRef.current?.next();
                      } catch {
                        // ignore
                      }
                    });
                  }}
                  disabled={busy}
                  aria-label="Page suivante"
                  title="Page suivante"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
              <details className="group max-w-[min(100%,12rem)] text-right sm:max-w-md">
                <summary className="text-eleven-muted eleven-body-airy cursor-pointer list-none text-xs underline decoration-transparent underline-offset-2 transition-colors marker:hidden hover:decoration-foreground [&::-webkit-details-marker]:hidden">
                  Avancé (CFI)
                </summary>
                <div className="text-eleven-muted mt-1 max-h-24 overflow-auto break-all font-mono text-[10px] leading-snug">
                  {location.cfi ?? "—"}
                </div>
              </details>
            </div>
          ) : null}

          <div className="relative min-h-0 flex-1">
            <div ref={containerRef} className="h-full w-full" />
          </div>
        </main>

        {!focusMode && rightOpen ? (
          <aside className="hidden h-full w-80 shrink-0 flex-col overflow-hidden border-l border-(--eleven-border-subtle) bg-background lg:flex">
            <div className="eleven-display-section text-foreground border-b border-(--eleven-border-subtle) px-3 py-3 text-base tracking-tight">
              Annotations
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-4 pt-2">
              <ReaderAnnotationsList
                annotations={annotations}
                busy={busy}
                emptyLabel="Aucune annotation pour ce livre."
                onGo={(cfi) => goToAnnotation(cfi, false)}
                onEdit={editAnnotation}
                onDelete={deleteAnnotation}
              />
            </div>
          </aside>
        ) : null}
      </div>

      {focusMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-end p-3">
          <div className="pointer-events-auto">
            <Button
              variant="outline"
              size="sm"
              className="rounded-eleven-pill shadow-eleven-button-white"
              onClick={() => setFocusMode(false)}
              aria-label="Quitter le mode focus"
              title="Quitter le mode focus"
              disabled={busy}
            >
              Quitter le focus
            </Button>
          </div>
        </div>
      ) : null}

      {leftOpen ? (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Table des matières"
        >
          <button
            type="button"
            className="reader-drawer-backdrop-enter absolute inset-0 bg-black/25"
            aria-label="Fermer la table des matières"
            onClick={() => setLeftOpen(false)}
          />
          <div className="reader-drawer-panel-left-enter shadow-eleven-card absolute top-14 left-0 flex h-[calc(100vh-3.5rem)] w-[min(80vw,320px)] flex-col overflow-hidden border-r border-(--eleven-border-subtle) bg-background">
            <div className="eleven-display-section text-foreground border-b border-(--eleven-border-subtle) px-3 py-3 text-base tracking-tight">
              Chapitres
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <ReaderTocList
                items={toc}
                emptyLabel="Table des matières indisponible."
                onNavigate={(href) => navigateToc(href, true)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {rightOpen ? (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Annotations"
        >
          <button
            type="button"
            className="reader-drawer-backdrop-enter absolute inset-0 bg-black/25"
            aria-label="Fermer les annotations"
            onClick={() => setRightOpen(false)}
          />
          <div className="reader-drawer-panel-right-enter shadow-eleven-card absolute top-14 right-0 flex h-[calc(100vh-3.5rem)] w-[min(86vw,420px)] flex-col overflow-hidden border-l border-(--eleven-border-subtle) bg-background">
            <div className="eleven-display-section text-foreground border-b border-(--eleven-border-subtle) px-3 py-3 text-base tracking-tight">
              Annotations
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-4 pt-2">
              <ReaderAnnotationsList
                annotations={annotations}
                busy={busy}
                emptyLabel="Aucune annotation pour ce livre."
                onGo={(cfi) => goToAnnotation(cfi, true)}
                onEdit={editAnnotation}
                onDelete={deleteAnnotation}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ReaderSettingsDialog
        open={readerSettingsOpen}
        onOpenChange={setReaderSettingsOpen}
        prefs={{
          readerFontFamily: prefs.readerFontFamily,
          readerFontSize: prefs.readerFontSize,
          readerLineHeight: prefs.readerLineHeight,
          readerMargin: prefs.readerMargin,
          readerTheme: prefs.readerTheme,
          readerFlow: prefs.readerFlow,
        }}
        onPatch={(patch) => updatePref(patch)}
        clampNumber={clampNumber}
      />

      <Dialog open={selectionDialogOpen} onOpenChange={setSelectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="eleven-display-section text-lg font-light tracking-tight">
              Surlignage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-muted-foreground text-xs">Texte</div>
              <Textarea
                value={pendingSelection?.text ?? ""}
                onChange={(e) =>
                  setPendingSelection((prev) => (prev ? { ...prev, text: e.target.value } : prev))
                }
                rows={4}
              />
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Note</div>
              <Textarea
                value={pendingSelection?.note ?? ""}
                onChange={(e) =>
                  setPendingSelection((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                }
                rows={3}
              />
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Couleur (hex)</div>
              <Input
                value={pendingSelection?.color ?? "#ffee55"}
                onChange={(e) =>
                  setPendingSelection((prev) => (prev ? { ...prev, color: e.target.value } : prev))
                }
              />
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectionDialogOpen(false);
                setPendingSelection(null);
              }}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button
              onClick={() => {
                startTransition(async () => {
                  if (!pendingSelection) return;
                  const isEditing = annotations.some(
                    (a) => a.cfiRange === pendingSelection.cfiRange,
                  );
                  if (isEditing) {
                    const existing = annotations.find(
                      (a) => a.cfiRange === pendingSelection.cfiRange,
                    );
                    if (existing) {
                      if (existing.id.startsWith("local:")) {
                        setAnnotations((prev) =>
                          prev.map((x) =>
                            x.id === existing.id
                              ? {
                                  ...x,
                                  content: pendingSelection.text || null,
                                  note: pendingSelection.note || null,
                                  color: pendingSelection.color || null,
                                }
                              : x,
                          ),
                        );
                        setSelectionDialogOpen(false);
                        setPendingSelection(null);
                        return;
                      }
                      const res = await offlineOrQueueAnnotationPatch({
                        bookId,
                        url: `/api/annotations/${existing.id}`,
                        body: {
                          content: pendingSelection.text || null,
                          note: pendingSelection.note || null,
                          color: pendingSelection.color || null,
                        },
                      });
                      setSelectionDialogOpen(false);
                      setPendingSelection(null);
                      if (!res.queued) await refreshAnnotations();
                      if (res.queued) {
                        setAnnotations((prev) =>
                          prev.map((x) =>
                            x.id === existing.id
                              ? {
                                  ...x,
                                  content: pendingSelection.text || null,
                                  note: pendingSelection.note || null,
                                  color: pendingSelection.color || null,
                                }
                              : x,
                          ),
                        );
                      }
                      return;
                    }
                  }
                  await createHighlightFromDialog();
                });
              }}
              disabled={busy}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OfflineManagerDialog
        open={offlineDialogOpen}
        onOpenChange={setOfflineDialogOpen}
        current={{ bookId, fileUrl: sanitizedFileUrl }}
      />
    </div>
  );
}
