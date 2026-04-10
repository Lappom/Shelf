import { describe, expect, it } from "vitest";

import {
  filterAdminUsers,
  paginateAdminUsers,
  sortAdminUsers,
  type AdminUserRow,
} from "./admin-users-list";

const sample: AdminUserRow[] = [
  {
    id: "a",
    email: "Zoe@ex.com",
    username: "zoe",
    role: "reader",
    createdAt: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "b",
    email: "amy@ex.com",
    username: "Amy",
    role: "admin",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "c",
    email: "bob@ex.com",
    username: "bob",
    role: "reader",
    createdAt: "2024-01-03T00:00:00.000Z",
  },
];

describe("filterAdminUsers", () => {
  it("returns all when query empty or whitespace", () => {
    expect(filterAdminUsers(sample, "")).toEqual(sample);
    expect(filterAdminUsers(sample, "   ")).toEqual(sample);
  });

  it("matches username case-insensitively", () => {
    expect(filterAdminUsers(sample, "AMY")).toEqual([sample[1]]);
  });

  it("matches email case-insensitively", () => {
    expect(filterAdminUsers(sample, "ZOE@EX")).toEqual([sample[0]]);
  });
});

describe("sortAdminUsers", () => {
  it("sorts by createdAt asc", () => {
    const sorted = sortAdminUsers(sample, "createdAt", "asc");
    expect(sorted.map((u) => u.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by username asc with locale", () => {
    const sorted = sortAdminUsers(sample, "username", "asc");
    expect(sorted.map((u) => u.username)).toEqual(["Amy", "bob", "zoe"]);
  });

  it("sorts by role desc", () => {
    const sorted = sortAdminUsers(sample, "role", "desc");
    expect(sorted.map((u) => u.role)).toEqual(["reader", "reader", "admin"]);
  });
});

describe("paginateAdminUsers", () => {
  it("returns empty when no items", () => {
    const r = paginateAdminUsers([], 1, 25);
    expect(r.pageItems).toEqual([]);
    expect(r.totalPages).toBe(0);
    expect(r.safePage).toBe(1);
  });

  it("clamps page to totalPages", () => {
    const r = paginateAdminUsers(sample, 99, 2);
    expect(r.safePage).toBe(2);
    expect(r.pageItems).toHaveLength(1);
  });

  it("slices first page", () => {
    const r = paginateAdminUsers(sample, 1, 2);
    expect(r.pageItems).toHaveLength(2);
    expect(r.totalPages).toBe(2);
  });
});
