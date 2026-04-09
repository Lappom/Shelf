import { prisma } from "@/lib/db/prisma";

function toTextArrayTsvectorSql(expr: string) {
  return `
    to_tsvector(
      'simple',
      COALESCE(
        (SELECT string_agg(value, ' ') FROM jsonb_array_elements_text(${expr}) AS value),
        ''
      )
    )
  `;
}

export async function updateBookSearchVector(bookId: string) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE "books" b
      SET "search_vector" =
        setweight(to_tsvector('simple', COALESCE(b.title, '')), 'A') ||
        setweight(${toTextArrayTsvectorSql("b.authors::jsonb")}, 'B') ||
        setweight(${toTextArrayTsvectorSql("b.subjects::jsonb")}, 'C') ||
        setweight(to_tsvector('simple', COALESCE(b.description, '')), 'D')
      WHERE b.id = $1::uuid
    `,
    bookId,
  );
}
