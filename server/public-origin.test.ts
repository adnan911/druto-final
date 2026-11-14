import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCloudflareRuntimeConfiguration, drutoPublicOrigin } from "./public-origin";

afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare public origin and secrets", () => {
  it("fails closed instead of issuing payment challenges for the Vercel origin", () => {
    vi.stubEnv("DRUTO_RUNTIME", "cloudflare");
    vi.stubEnv("DRUTO_API_URL", "");
    expect(drutoPublicOrigin).toThrow("DRUTO_API_URL is required");
    vi.stubEnv("DRUTO_API_URL", "http://druto.example");
    expect(drutoPublicOrigin).toThrow("HTTPS origin");
    vi.stubEnv("DRUTO_API_URL", "https://druto.example");
    expect(drutoPublicOrigin()).toBe("https://druto.example");
  });

  it("requires authentication secrets before readiness", () => {
    vi.stubEnv("DRUTO_RUNTIME", "cloudflare");
    vi.stubEnv("DRUTO_API_URL", "https://druto.example");
    vi.stubEnv("JWT_SECRET", "short");
    expect(assertCloudflareRuntimeConfiguration).toThrow("JWT_SECRET");
    vi.stubEnv("JWT_SECRET", "x".repeat(32));
    vi.stubEnv("PRIVY_APP_ID", "");
    expect(assertCloudflareRuntimeConfiguration).toThrow("Privy");
    vi.stubEnv("PRIVY_APP_ID", "fixture-app-id");
    vi.stubEnv("PRIVY_APP_SECRET", "fixture-app-secret");
    expect(assertCloudflareRuntimeConfiguration).not.toThrow();
  });
});
