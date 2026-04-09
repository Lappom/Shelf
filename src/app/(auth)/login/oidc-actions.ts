"use server";

import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export async function oidcSignInAction() {
  try {
    await signIn("oidc", { redirectTo: "/library" });
  } catch {
    redirect("/login?error=auth");
  }
}
