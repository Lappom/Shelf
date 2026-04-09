import { describe, expect, it } from "vitest";

import initSqlJs from "sql.js";

import { parseCalibreMetadataDb } from "./parseMetadataDb";

async function makeDbBytes() {
  const SQL = await initSqlJs({
    locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
  });

  const db = new SQL.Database();
  db.exec(`
    CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, comments TEXT, path TEXT, series INTEGER);
    CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE books_authors_link (book INTEGER, author INTEGER);
    CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE books_tags_link (book INTEGER, tag INTEGER);
    CREATE TABLE data (id INTEGER PRIMARY KEY, book INTEGER, format TEXT, name TEXT);
    CREATE TABLE covers (book INTEGER, data BLOB);
  `);

  db.exec("INSERT INTO series (id, name) VALUES (1, 'The Series');");
  db.exec(
    "INSERT INTO books (id, title, comments, path, series) VALUES (10, 'My Book', 'Desc', 'Author/My Book (10)', 1);",
  );
  db.exec("INSERT INTO authors (id, name) VALUES (7, 'Alice');");
  db.exec("INSERT INTO books_authors_link (book, author) VALUES (10, 7);");
  db.exec("INSERT INTO tags (id, name) VALUES (3, 'tag-a');");
  db.exec("INSERT INTO books_tags_link (book, tag) VALUES (10, 3);");
  db.exec(
    "INSERT INTO data (id, book, format, name) VALUES (1, 10, 'EPUB', 'My Book - Alice.epub');",
  );
  db.exec("INSERT INTO covers (book, data) VALUES (10, X'FFD8FF00');"); // jpeg-ish header

  const bytes = db.export();
  db.close();
  return bytes;
}

describe("parseCalibreMetadataDb", () => {
  it("parses basic calibre schema", async () => {
    const bytes = await makeDbBytes();
    const res = await parseCalibreMetadataDb(bytes);
    expect(res.books.length).toBeGreaterThan(0);

    const book = res.books.find((b) => b.calibreBookId === 10);
    expect(book).toBeTruthy();
    expect(book?.title).toBe("My Book");
    expect(book?.authors).toEqual(["Alice"]);
    expect(book?.tags).toEqual(["tag-a"]);
    expect(book?.seriesName).toBe("The Series");
    expect(book?.epubFileName).toBe("My Book - Alice.epub");
    expect(book?.coverImage).toBeInstanceOf(Uint8Array);
  });
});
