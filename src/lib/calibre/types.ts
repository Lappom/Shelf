export type CalibreBookRecord = {
  calibreBookId: number;
  title: string;
  description: string | null;
  calibrePath: string | null;
  seriesName: string | null;
  authors: string[];
  tags: string[];
  epubFileName: string | null;
  coverImage: Uint8Array | null;
};

export type CalibreParseResult = {
  books: CalibreBookRecord[];
  warnings: string[];
};
