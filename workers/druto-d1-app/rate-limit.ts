type RateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

export type RateLimitEnv = {
  DRUTO_IP_RATE_LIMITER?: RateLimiter;
  DRUTO_CREDENTIAL_RATE_LIMITER?: RateLimiter;
};

function routeGroup(pathname: string): string {
  if (pathname.includes("/auth.")) return "auth";
  if (pathname.includes("/payments.")) return "payments";
  return "api";
}

function limitedResponse(status: 429 | 503): Response {
  return new Response(JSON.stringify({ error: status === 429 ? "Too many requests" : "API protection unavailable" }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(status === 429 ? { "retry-after": "60" } : {}),
    },
  });
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Protect D1-backed API routes before the Node/Express adapter or database runs.
 * The IP bucket bounds unauthenticated credential guessing; the credential bucket
 * avoids penalizing unrelated sellers behind the same marketplace egress address.
 */
export async function enforceD1ApiRateLimit(request: Request, env: RateLimitEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/health" || pathname === "/api/ready") return null;
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/trpc/")) return null;
  if (!env.DRUTO_IP_RATE_LIMITER || !env.DRUTO_CREDENTIAL_RATE_LIMITER) return limitedResponse(503);

  const group = routeGroup(pathname);
  // Cloudflare sets CF-Connecting-IP at its edge. Do not trust X-Forwarded-For.
  // Service bindings and local development can omit it; credentials then provide
  // a separate per-seller bucket below.
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  try {
    const ipResult = await env.DRUTO_IP_RATE_LIMITER.limit({ key: `${group}:${ip}` });
    if (!ipResult.success) return limitedResponse(429);

    const authorization = request.headers.get("authorization");
    const cookie = request.headers.get("cookie");
    const credential = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : cookie;
    if (credential) {
      // The limiter key and logs must never contain raw API keys or session cookies.
      const credentialResult = await env.DRUTO_CREDENTIAL_RATE_LIMITER.limit({
        key: `${group}:${await digest(credential)}`,
      });
      if (!credentialResult.success) return limitedResponse(429);
    }
    return null;
  } catch {
    return limitedResponse(503);
  }
}
