import { describe, expect, it, vi } from "vitest";

import { AUTH_ERROR, requireAdmin, requireRole, requireUser } from "./rbac";

vi.mock("@/auth", () => {
  return {
    auth: vi.fn(async () => null),
  };
});

describe("rbac", () => {
  it("requireUser throws when unauthenticated", async () => {
    await expect(requireUser()).rejects.toThrow(AUTH_ERROR.UNAUTHENTICATED);
  });

  it("requireRole throws when role mismatches", async () => {
    const { auth } = await import("@/auth");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "u1", role: "reader" },
    });
    await expect(requireRole("admin")).rejects.toThrow(AUTH_ERROR.FORBIDDEN);
  });

  it("requireAdmin accepts admin", async () => {
    const { auth } = await import("@/auth");
    (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { id: "u1", role: "admin" },
    });
    await expect(requireAdmin()).resolves.toMatchObject({ id: "u1" });
  });
});

