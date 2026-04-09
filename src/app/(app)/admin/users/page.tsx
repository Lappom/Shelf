import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { AdminUsersClient } from "./ui";

export default async function AdminUsersPage() {
  const sessionUser = await requireAdmin();
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
    <div className="space-y-4">
      <div>
        <h2 className="eleven-display-section text-xl">Utilisateurs</h2>
        <p className="text-eleven-muted text-sm">
          Liste des comptes actifs. Rôle global : admin (gestion catalogue) ou reader (lecture et
          étagères personnelles).
        </p>
      </div>
      <AdminUsersClient users={users} currentUserId={actorId} />
    </div>
  );
}
