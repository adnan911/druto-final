import { describe, expect, it } from "vitest";

describe("Privy configuration", () => {
  it.skipIf(process.env.RUN_PRIVY_LIVE_TEST !== "1")( "authenticates the configured app against Privy", async () => {
    const appId = process.env.PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) throw new Error("Privy credentials are not configured");

    const response = await fetch(`https://auth.privy.io/v1/apps/${encodeURIComponent(appId)}/jwks.json`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
        Accept: "application/json",
      },
    });

    expect(response.status).toBe(200);
  }, 15_000);
});
