import { requireAdminPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { AdminUsersClient } from "./ui";

export default async function AdminUsersPage() {
  const sessionUser = await requireAdminPage();
  const actorId = String((sessionUser as { id?: unknown }).id ?? "");

  const rows = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }],
    take: 500,
  });

  const users = rows.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div className="shelf-hero-enter space-y-2">
        <h2 className="eleven-display-section text-foreground text-2xl tracking-tight md:text-[2rem]">
          Utilisateurs
        </h2>
        <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-[0.94rem] leading-relaxed">
          Liste des comptes actifs. Rôle global : admin (gestion catalogue) ou reader (lecture et
          étagères personnelles).
        </p>
      </div>
      <AdminUsersClient users={users} currentUserId={actorId} />
    </div>
  );
}
