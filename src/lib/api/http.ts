import { NextResponse } from "next/server";

import { addCorsHeaders, handleCorsPreflight } from "@/lib/security/cors";

export function getClientIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function corsJson(
  req: Request,
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
) {
  return addCorsHeaders(NextResponse.json(body, init), req);
}

export function corsPreflight(req: Request) {
  const preflight = handleCorsPreflight(req);
  return preflight ?? addCorsHeaders(new Response(null, { status: 204 }), req);
}
