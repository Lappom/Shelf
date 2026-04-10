function getAppOrigin() {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * In development/test, treat localhost / 127.0.0.1 / ::1 as the same origin when
 * protocol and port match. Avoids BAD_ORIGIN when NEXTAUTH_URL uses one host and
 * the browser uses another (common with Playwright baseURL vs .env.local).
 * Never applied in production.
 */
function loopbackOriginsMatch(a: string, b: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (!isLoopbackHost(ua.hostname) || !isLoopbackHost(ub.hostname)) return false;
    return ua.protocol === ub.protocol && ua.port === ub.port;
  } catch {
    return false;
  }
}

export function assertSameOriginFromHeaders(input: { origin: string | null; host: string | null }) {
  const appOrigin = getAppOrigin();

  // If we can't determine app origin, we can't enforce a strict check safely.
  if (!appOrigin) return;

  // Browsers send Origin on CORS requests and most state-changing requests.
  // If Origin is missing, we accept (e.g. same-origin GET, server-to-server).
  if (!input.origin) return;

  if (input.origin !== appOrigin && !loopbackOriginsMatch(appOrigin, input.origin)) {
    throw new Error("BAD_ORIGIN");
  }
}
