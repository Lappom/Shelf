import { z, ZodError } from "zod";

import { AUTH_ERROR } from "@/lib/auth/rbac";

export type ApiErrorPayload = {
  error: string;
};

export function apiErrorStatus(e: unknown): number {
  if (e instanceof ZodError) return 400;
  if (e instanceof Error) {
    if (e.message === "INVALID_JSON") return 400;
    if (e.message === "BAD_ORIGIN") return 403;
    if (e.message === "RATE_LIMITED") return 429;
    if (e.message === "NOT_FOUND") return 404;
    if (e.message === "SYSTEM_SHELF") return 400;
    if (e.message === "UNSUPPORTED") return 400;
    if (e.message === AUTH_ERROR.UNAUTHENTICATED) return 401;
    if (e.message === AUTH_ERROR.FORBIDDEN) return 403;
  }
  return 500;
}

export function apiErrorPayload(e: unknown): ApiErrorPayload {
  if (e instanceof ZodError) return { error: "Invalid input" };
  if (e instanceof Error) {
    if (e.message === "INVALID_JSON") return { error: "Invalid JSON" };
    if (e.message === "BAD_ORIGIN") return { error: "Bad origin" };
    if (e.message === "RATE_LIMITED") return { error: "Too many requests" };
    if (e.message === "NOT_FOUND") return { error: "Not found" };
    if (e.message === "SYSTEM_SHELF") return { error: "System shelf" };
    if (e.message === "UNSUPPORTED") return { error: "Unsupported" };
    if (e.message === AUTH_ERROR.UNAUTHENTICATED) return { error: "Unauthenticated" };
    if (e.message === AUTH_ERROR.FORBIDDEN) return { error: "Forbidden" };
    return { error: e.message || "Error" };
  }
  return { error: "Internal error" };
}

export function asUuidOrThrow(v: unknown, errorMessage = "Invalid id") {
  return z.string().uuid({ message: errorMessage }).parse(v);
}
