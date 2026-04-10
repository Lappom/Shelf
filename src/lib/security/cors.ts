function getAppOrigin() {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function addCorsHeaders(res: Response, req: Request) {
  const appOrigin = getAppOrigin();
  if (!appOrigin) return res;

  const origin = req.headers.get("origin");
  if (origin && origin !== appOrigin) return res;

  res.headers.set("Access-Control-Allow-Origin", appOrigin);
  res.headers.set("Vary", "Origin");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  return res;
}

export function handleCorsPreflight(req: Request) {
  if (req.method !== "OPTIONS") return null;
  const res = new Response(null, { status: 204 });
  return addCorsHeaders(res, req);
}
