-- Performance indexes (SPECS §15): FTS GIN, title trigram for similarity(), pivot lookups.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS books_search_vector_gin_idx ON books USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS books_title_gin_trgm_idx ON books USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS user_annotations_user_book_idx ON user_annotations (user_id, book_id);
