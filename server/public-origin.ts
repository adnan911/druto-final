const LEGACY_VERCEL_ORIGIN = "https://druto-final.vercel.app";

export function drutoPublicOrigin(): string {
  const configured = process.env.DRUTO_API_URL;
  if (!configured && process.env.DRUTO_RUNTIME === "cloudflare") {
    throw new Error("DRUTO_API_URL is required on Cloudflare");
  }
  const url = new URL(configured || LEGACY_VERCEL_ORIGIN);
  if ((process.env.DRUTO_RUNTIME === "cloudflare" && url.protocol !== "https:") ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("DRUTO_API_URL must be a clean HTTPS origin");
  }
  return url.origin;
}

export function assertCloudflareRuntimeConfiguration(): void {
  if (process.env.DRUTO_RUNTIME !== "cloudflare") return;
  drutoPublicOrigin();
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("Cloudflare JWT_SECRET must contain at least 32 characters");
  }
  if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
    throw new Error("Cloudflare Privy authentication is not configured");
  }
}
