import { describe, expect, it } from "vitest";

import { buildSearchUrlFromState, parseSearchUrlState } from "@/lib/search/searchUrlState";

describe("searchUrlState", () => {
  it("parses CSV filters and basic params", () => {
    const s = parseSearchUrlState(
      "?q=foundation&mode=websearch&sort=title&dir=asc&formats=epub,physical&tagIds=a,b&author=Asimov",
    );
    expect(s.q).toBe("foundation");
    expect(s.mode).toBe("websearch");
    expect(s.sort).toBe("title");
    expect(s.dir).toBe("asc");
    expect(s.formats).toEqual(["epub", "physical"]);
    expect(s.tagIds).toEqual(["a", "b"]);
    expect(s.author).toBe("Asimov");
  });

  it("builds a stable /search URL (omits empty fields)", () => {
    const url = buildSearchUrlFromState({
      q: "  hello  ",
      mode: "plain",
      sort: "relevance",
      dir: "desc",
      formats: [],
      languages: ["fr"],
      tagIds: [],
      shelfId: "",
      statuses: ["reading"],
      author: "",
      publisher: "  Gallimard ",
      addedFrom: "",
      addedTo: "",
      pagesMin: "100",
      pagesMax: "",
    });
    expect(url).toContain("/search?");
    expect(url).toContain("q=hello");
    expect(url).toContain("mode=plain");
    expect(url).toContain("languages=fr");
    expect(url).toContain("statuses=reading");
    expect(url).toContain("publisher=Gallimard");
    expect(url).toContain("pagesMin=100");
    expect(url).not.toContain("formats=");
    expect(url).not.toContain("tagIds=");
    expect(url).not.toContain("shelfId=");
    expect(url).not.toContain("addedFrom=");
  });
});
