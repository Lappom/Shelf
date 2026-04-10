"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export async function oidcSignInAction() {
  try {
    await signIn("oidc", { redirectTo: "/library" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/login?error=auth");
    throw e;
  }
}
