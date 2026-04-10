export type AdminUserRow = {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
};

export type SortField = "createdAt" | "username" | "email" | "role";

/**
 * Client-side filter: username or email, case-insensitive substring match.
 */
export function filterAdminUsers(users: AdminUserRow[], query: string): AdminUserRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );
}

/**
 * Stable sort copy by field and direction.
 */
export function sortAdminUsers(
  users: AdminUserRow[],
  field: SortField,
  dir: "asc" | "desc",
): AdminUserRow[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "createdAt":
        cmp = a.createdAt.localeCompare(b.createdAt);
        break;
      case "username":
        cmp = a.username.localeCompare(b.username, "fr", { sensitivity: "base" });
        break;
      case "email":
        cmp = a.email.localeCompare(b.email, "fr", { sensitivity: "base" });
        break;
      case "role":
        cmp = a.role.localeCompare(b.role);
        break;
      default:
        break;
    }
    return cmp * mult;
  });
}

export type PaginateResult<T> = {
  pageItems: T[];
  totalPages: number;
  safePage: number;
};

/**
 * 1-based page index; returns empty slice when there are no items.
 */
export function paginateAdminUsers<T>(items: T[], page: number, pageSize: number): PaginateResult<T> {
  if (items.length === 0) {
    return { pageItems: [], totalPages: 0, safePage: 1 };
  }
  const totalPages = Math.ceil(items.length / pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    totalPages,
    safePage,
  };
}
