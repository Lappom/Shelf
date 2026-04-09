"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signIn } from "@/auth";

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(100),
  password: z.string().min(8),
});

export async function registerAction(formData: FormData) {
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

  const email = parsed.data.email.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: parsed.data.username }] },
    select: { id: true },
  });
  if (existing) redirect("/register?error=exists");

  const passwordHash = await hashPassword(parsed.data.password);

  const usersCount = await prisma.user.count({ where: { deletedAt: null } });
  const role = usersCount === 0 ? "admin" : "reader";

  await prisma.user.create({
    data: {
      email,
      username: parsed.data.username,
      passwordHash,
      role,
    },
  });

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/library",
    });
  } catch {
    // Silent: the UI will redirect on manual login.
  }
  redirect("/library");
}
