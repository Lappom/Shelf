"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { signIn } from "@/auth";

export async function oidcSignInAction() {
  try {
    await signIn("oidc", { redirectTo: "/library" });
  } catch (e) {
    unstable_rethrow(e);
    redirect("/login?error=auth");
  }
}
