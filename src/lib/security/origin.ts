function getAppOrigin() {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function assertSameOriginFromHeaders(input: {
  origin: string | null;
  host: string | null;
}) {
  const appOrigin = getAppOrigin();

  // If we can't determine app origin, we can't enforce a strict check safely.
  if (!appOrigin) return;

  // Browsers send Origin on CORS requests and most state-changing requests.
  // If Origin is missing, we accept (e.g. same-origin GET, server-to-server).
  if (!input.origin) return;

  if (input.origin !== appOrigin) {
    throw new Error("BAD_ORIGIN");
  }
}

