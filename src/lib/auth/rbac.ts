import { redirect } from "next/navigation";

import { auth } from "@/auth";

export type AppRole = "admin" | "reader";

export const AUTH_ERROR = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
} as const;

export async function getOptionalSessionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

/** Server Components (pages): redirect to login instead of throwing (avoids digest errors vs layout). */
export async function requireUserPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error(AUTH_ERROR.UNAUTHENTICATED);
  return session.user;
}

export async function requireRole(role: AppRole) {
  const user = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (user as any).role as AppRole | undefined;
  if (userRole !== role) throw new Error(AUTH_ERROR.FORBIDDEN);
  return user;
}

export async function requireAdmin() {
  return requireRole("admin");
}

/** Server Components: like requireAdmin but redirects (login if anonymous, library if not admin). */
export async function requireAdminPage() {
  const user = await requireUserPage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (user as any).role as AppRole | undefined;
  if (userRole !== "admin") redirect("/library");
  return user;
}
