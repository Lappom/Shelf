"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "reader"]),
});

/**
 * Updates a user's global role (admin only). Prevents removing the last admin.
 */
export async function updateUserRoleAction(input: unknown) {
  const admin = await requireAdmin();
  const adminId = String((admin as { id?: unknown }).id ?? "");
  const parsed = UpdateRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid payload" };
  }
  const { userId, role } = parsed.data;

  if (userId === adminId && role === "reader") {
    const otherAdmin = await prisma.user.count({
      where: { deletedAt: null, role: "admin", id: { not: adminId } },
    });
    if (otherAdmin === 0) {
      return { ok: false as const, error: "Cannot demote the last admin" };
    }
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!target) return { ok: false as const, error: "User not found" };

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  revalidatePath("/admin/users");
  return { ok: true as const };
}

const SoftDeleteUserSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * Soft-deletes a user (admin only). Cannot delete self.
 */
export async function softDeleteUserAction(input: unknown) {
  const admin = await requireAdmin();
  const adminId = String((admin as { id?: unknown }).id ?? "");
  const parsed = SoftDeleteUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid payload" };
  }
  if (parsed.data.userId === adminId) {
    return { ok: false as const, error: "Cannot delete yourself" };
  }

  const target = await prisma.user.findFirst({
    where: { id: parsed.data.userId, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false as const, error: "User not found" };

  if (target.role === "admin") {
    const otherAdmin = await prisma.user.count({
      where: { deletedAt: null, role: "admin", id: { not: target.id } },
    });
    if (otherAdmin === 0) {
      return { ok: false as const, error: "Cannot delete the last admin" };
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/admin/users");
  return { ok: true as const };
}
