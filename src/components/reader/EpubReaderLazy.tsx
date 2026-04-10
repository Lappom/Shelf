"use client";

import dynamic from "next/dynamic";

type Props = {
  bookId: string;
  fileUrl: string;
  bookTitle: string;
  bookAuthors: string[];
  initialPrefs: {
    readerFontFamily: string | null;
    readerFontSize: number | null;
    readerLineHeight: number | null;
    readerMargin: number | null;
    readerTheme: "light" | "dark" | "sepia" | null;
    readerFlow: "paginated" | "scrolled" | null;
  } | null;
  initialProgress: {
    progress: number;
    currentCfi: string | null;
    currentPage: number | null;
    status: "not_started" | "reading" | "finished" | "abandoned";
    updatedAt: string | Date | null;
  } | null;
  initialAnnotations: Array<{
    id: string;
    type: "highlight" | "note" | "bookmark";
    cfiRange: string;
    content: string | null;
    note: string | null;
    color: string | null;
  }>;
};

const EpubReaderClient = dynamic(
  () =>
    import(/* webpackChunkName: "epub-reader" */ "./EpubReaderClient").then(
      (m) => m.EpubReaderClient,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="reader-lazy-fade-enter flex min-h-[calc(100vh-3.5rem)] flex-col gap-6 p-6"
        aria-busy="true"
        aria-label="Chargement du lecteur"
      >
        <div className="flex items-center gap-3">
          <div className="bg-muted/80 h-10 w-10 shrink-0 rounded-eleven-pill shadow-eleven-button-white" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="bg-muted/80 h-4 max-w-[14rem] rounded-eleven-pill" />
            <div className="bg-muted/60 h-3 max-w-[10rem] rounded-eleven-pill" />
          </div>
        </div>
        <div className="bg-muted/50 h-1.5 w-full max-w-md overflow-hidden rounded-eleven-pill">
          <div className="bg-foreground/25 h-full w-1/3 animate-pulse rounded-eleven-pill" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-[20px] border border-(--eleven-border-subtle) bg-background/80 p-4 shadow-eleven-card">
          <div className="bg-muted/70 h-8 w-40 rounded-eleven-pill" />
          <div className="bg-muted/50 mt-2 min-h-[200px] flex-1 rounded-[16px]" />
        </div>
        <p className="text-eleven-muted eleven-body-airy text-sm">Préparation du lecteur…</p>
      </div>
    ),
  },
);

export function EpubReaderLazy(props: Props) {
  return <EpubReaderClient {...props} />;
}
