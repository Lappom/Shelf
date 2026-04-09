import { auth } from "@/auth";

export type AppRole = "admin" | "reader";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user;
}

export async function requireRole(role: AppRole) {
  const user = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRole = (user as any).role as AppRole | undefined;
  if (userRole !== role) throw new Error("FORBIDDEN");
  return user;
}
