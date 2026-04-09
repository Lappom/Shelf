import { describe, expect, it, vi } from "vitest";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000ad";

vi.mock("@/lib/auth/rbac", () => ({
  requireAdmin: vi.fn(async () => ({ id: ADMIN_ID })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("admin users actions", () => {
  it("updateUserRoleAction rejects demoting last admin", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.user.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const { updateUserRoleAction } = await import("./actions");
    const res = await updateUserRoleAction({ userId: ADMIN_ID, role: "reader" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("last admin");
  });

  it("updateUserRoleAction updates when another admin exists", async () => {
    const targetId = "00000000-0000-4000-8000-0000000000b2";
    const { prisma } = await import("@/lib/db/prisma");
    (prisma.user.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: targetId });
    (prisma.user.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const { updateUserRoleAction } = await import("./actions");
    const res = await updateUserRoleAction({ userId: targetId, role: "admin" });
    expect(res.ok).toBe(true);
  });

  it("softDeleteUserAction rejects self-delete", async () => {
    const { softDeleteUserAction } = await import("./actions");
    const res = await softDeleteUserAction({ userId: ADMIN_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("yourself");
  });
});
