"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function loginAction(formData: FormData) {
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
