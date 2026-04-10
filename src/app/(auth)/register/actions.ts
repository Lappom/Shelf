"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signIn } from "@/auth";
import { ensureSystemShelves } from "@/lib/shelves/system";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const RegisterSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  username: z.string().trim().min(2).max(100),
  password: z.string().min(8),
});

export async function registerAction(formData: FormData) {
  const h = await headers();
  assertSameOriginFromHeaders({
    origin: h.get("origin"),
    host: h.get("host"),
  });

  try {
    await rateLimitOrThrow({
      key: `auth:register:${h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown"}`,
      limit: 5,
      windowMs: 60_000,
    });
  } catch {
    redirect("/register?error=invalid");
  }

  if (process.env.REGISTRATION_ENABLED === "false") {
    redirect("/register?error=disabled");
  }

  const parsed = RegisterSchema.safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/register?error=invalid");
  }

  const email = parsed.data.email;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: parsed.data.username }] },
    select: { id: true },
  });
  if (existing) redirect("/register?error=exists");

  const passwordHash = await hashPassword(parsed.data.password);

  const usersCount = await prisma.user.count({ where: { deletedAt: null } });
  const role = usersCount === 0 ? "admin" : "reader";

  const createdUser = await prisma.user.create({
    data: {
      email,
      username: parsed.data.username,
      passwordHash,
      role,
    },
    select: { id: true },
  });

  // Provision system shelves for new users.
  await ensureSystemShelves(createdUser.id);

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/library",
    });
  } catch (e) {
    if (e instanceof AuthError) redirect("/register?error=auth");
    throw e;
  }
}
