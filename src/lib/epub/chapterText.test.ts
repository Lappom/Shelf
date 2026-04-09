import { describe, expect, test } from "vitest";

import { extractEpubChapterPlainText } from "./chapterText";

describe("extractEpubChapterPlainText", () => {
  test("rejects non-zip bytes", async () => {
    await expect(
      extractEpubChapterPlainText({ epubBytes: Buffer.from("not an epub"), chapterIndex: 0 }),
    ).rejects.toThrow();
  });
});
