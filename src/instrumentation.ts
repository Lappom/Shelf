import { validateServerEnv } from "@/lib/env/server";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  validateServerEnv();
}
