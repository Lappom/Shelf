import { describe, expect, it } from "vitest";

import { buildBookFileStoragePath, buildCoverStoragePath, slugifyAuthor } from "./paths";

describe("storage paths", () => {
  it("buildBookFileStoragePath follows /{format}/{author}/{filename}", () => {
    expect(buildBookFileStoragePath({ format: "epub", author: "Isaac Asimov", filename: "x.epub" })).toBe(
      "epub/isaac-asimov/x.epub",
    );
  });

  it("slugifyAuthor is stable and never empty", () => {
    expect(slugifyAuthor("  ")).toBe("unknown");
    expect(slugifyAuthor("Émile Zola")).toBe("emile-zola");
  });

  it("buildCoverStoragePath follows /covers/{book_id}.{ext}", () => {
    expect(buildCoverStoragePath({ bookId: "b1", ext: "jpg" })).toBe("covers/b1.jpg");
    expect(buildCoverStoragePath({ bookId: "b1", ext: ".png" })).toBe("covers/b1.png");
  });
});

