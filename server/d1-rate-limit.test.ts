import { describe, expect, it, vi } from "vitest";
import { enforceD1ApiRateLimit } from "../workers/druto-d1-app/rate-limit";

function limiter(success = true) {
  return { limit: vi.fn(async (_input: { key: string }) => ({ success })) };
}

describe("D1 API rate limiting", () => {
  it("keeps readiness available and fails closed when a binding is missing", async () => {
    expect(await enforceD1ApiRateLimit(new Request("https://druto.example/api/ready"), {})).toBeNull();
    const response = await enforceD1ApiRateLimit(new Request("https://druto.example/api/trpc/auth.createWalletChallenge", {
      method: "POST",
    }), {});
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("uses a Cloudflare IP bucket for anonymous requests and never trusts forwarded-for", async () => {
    const ip = limiter();
    const credential = limiter();
    const request = new Request("https://druto.example/trpc/auth.createWalletChallenge", {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" },
    });
    expect(await enforceD1ApiRateLimit(request, {
      DRUTO_IP_RATE_LIMITER: ip,
      DRUTO_CREDENTIAL_RATE_LIMITER: credential,
    })).toBeNull();
    expect(ip.limit).toHaveBeenCalledWith({ key: "auth:203.0.113.7" });
    expect(credential.limit).not.toHaveBeenCalled();
  });

  it("uses a digest, never a raw seller API key, for the credential bucket", async () => {
    const ip = limiter();
    const credential = limiter();
    const request = new Request("https://druto.example/api/trpc/payments.createIntent", {
      method: "POST",
      headers: { authorization: "Bearer druto_secret_value", "cf-connecting-ip": "203.0.113.8" },
    });
    expect(await enforceD1ApiRateLimit(request, {
      DRUTO_IP_RATE_LIMITER: ip,
      DRUTO_CREDENTIAL_RATE_LIMITER: credential,
    })).toBeNull();
    expect(ip.limit).toHaveBeenCalledWith({ key: "payments:203.0.113.8" });
    const key = credential.limit.mock.calls[0]?.[0].key;
    expect(key).toMatch(/^payments:[a-f0-9]{64}$/);
    expect(key).not.toContain("druto_secret_value");
  });

  it("returns a no-store 429 with retry hint before reaching the app", async () => {
    const ip = limiter(false);
    const credential = limiter();
    const response = await enforceD1ApiRateLimit(new Request("https://druto.example/trpc/payments.getIntent"), {
      DRUTO_IP_RATE_LIMITER: ip,
      DRUTO_CREDENTIAL_RATE_LIMITER: credential,
    });
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("60");
    expect(credential.limit).not.toHaveBeenCalled();
  });

  it("limits one credential without exposing the cookie in the limiter key", async () => {
    const ip = limiter();
    const credential = limiter(false);
    const response = await enforceD1ApiRateLimit(new Request("https://druto.example/api/trpc/merchantAccounts.listMine", {
      headers: { cookie: "druto_session=sensitive_session_value" },
    }), {
      DRUTO_IP_RATE_LIMITER: ip,
      DRUTO_CREDENTIAL_RATE_LIMITER: credential,
    });
    expect(response?.status).toBe(429);
    const key = credential.limit.mock.calls[0]?.[0].key;
    expect(key).toMatch(/^api:[a-f0-9]{64}$/);
    expect(key).not.toContain("sensitive_session_value");
  });

  it("fails closed if the Cloudflare limiter errors", async () => {
    const ip = { limit: vi.fn(async () => { throw new Error("limiter unavailable"); }) };
    const response = await enforceD1ApiRateLimit(new Request("https://druto.example/trpc/payments.getIntent"), {
      DRUTO_IP_RATE_LIMITER: ip,
      DRUTO_CREDENTIAL_RATE_LIMITER: limiter(),
    });
    expect(response?.status).toBe(503);
  });
});
