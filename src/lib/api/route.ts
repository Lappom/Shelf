import { NextResponse } from "next/server";

import { corsPreflight } from "@/lib/api/http";
import { apiErrorPayload, apiErrorStatus } from "@/lib/api/errors";
import { addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";

type ApiContext<TUser> = {
  req: Request;
  user: TUser | null;
};

type ApiRouteOptions<TUser> = {
  /**
   * If true, enforces strict same-origin when Origin header is present.
   * Recommended for mutation endpoints. Safe default is false for read-only GET.
   */
  sameOrigin?: boolean;
  auth?: () => Promise<TUser>;
  rateLimit?: (ctx: ApiContext<TUser>) => Promise<void>;
};

export async function runApiRoute<TUser>(
  req: Request,
  opts: ApiRouteOptions<TUser>,
  handler: (ctx: ApiContext<TUser>) => Promise<Response>,
): Promise<Response> {
  try {
    if (req.method === "OPTIONS") return corsPreflight(req);

    if (opts.sameOrigin) {
      assertSameOriginFromHeaders({
        origin: req.headers.get("origin"),
        host: req.headers.get("host"),
      });
    }

    const user = opts.auth ? await opts.auth() : null;
    const ctx: ApiContext<TUser> = { req, user };

    if (opts.rateLimit) await opts.rateLimit(ctx);

    const res = await handler(ctx);
    return addCorsHeaders(res, req);
  } catch (e) {
    const status = apiErrorStatus(e);
    return addCorsHeaders(NextResponse.json(apiErrorPayload(e), { status }), req);
  }
}
