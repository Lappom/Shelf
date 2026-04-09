import { describe, expect, it } from "vitest";

import { parseShelfRuleJson, buildShelfRuleWhereSql } from "@/lib/shelves/rules";

describe("shelf rules", () => {
  it("parses a valid rule payload (spec example shape)", () => {
    const rule = parseShelfRuleJson({
      match: "all",
      conditions: [
        { field: "language", operator: "eq", value: "fr" },
        { field: "subjects", operator: "contains", value: "Science Fiction" },
        { field: "authors", operator: "contains", value: "Asimov" },
        { field: "format", operator: "in", value: ["epub", "pdf"] },
        { field: "page_count", operator: "gte", value: 300 },
        { field: "tags", operator: "has_any", value: ["to-read", "classic"] },
        { field: "added_at", operator: "after", value: "2024-01-01" },
      ],
    });

    expect(rule.match).toBe("all");
    expect(rule.conditions.length).toBe(7);
  });

  it("rejects missing value when operator requires one", () => {
    expect(() =>
      parseShelfRuleJson({
        match: "all",
        conditions: [{ field: "language", operator: "eq" }],
      }),
    ).toThrow();
  });

  it("builds a Prisma SQL fragment", () => {
    const rule = parseShelfRuleJson({
      match: "any",
      conditions: [
        { field: "language", operator: "eq", value: "fr" },
        { field: "tags", operator: "is_not_empty" },
      ],
    });

    const sql = buildShelfRuleWhereSql(rule);
    expect(sql).toBeTruthy();
  });
});

