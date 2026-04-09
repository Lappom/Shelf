"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { signIn } from "@/auth";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function loginAction(formData: FormData) {
  const h = await headers();
  assertSameOriginFromHeaders({
    origin: h.get("origin"),
    host: h.get("host"),
  });

  try {
    await rateLimitOrThrow({
      key: `auth:login:${h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown"}`,
      limit: 10,
      windowMs: 60_000,
    });
  } catch {
    redirect("/login?error=auth");
  }

  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/library",
    });
  } catch {
    redirect("/login?error=auth");
  }
}
