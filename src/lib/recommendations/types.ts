/** Structured reason for UI filters and display (French copy). */
export type RecommendationReason = {
  code: string;
  text: string;
};

export type BookFeatures = {
  id: string;
  title: string;
  authors: string[];
  subjectTerms: string[];
  tagIds: string[];
  language: string | null;
  publisher: string | null;
  pageCount: number | null;
  createdAt: Date;
};
