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
    import(/* webpackChunkName: "epub-reader" */ "./EpubReaderClient").then((m) => m.EpubReaderClient),
  { ssr: false, loading: () => <div className="p-6">Chargement du reader…</div> },
);

export function EpubReaderLazy(props: Props) {
  return <EpubReaderClient {...props} />;
}
