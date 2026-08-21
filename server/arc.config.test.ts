import { describe, expect, it } from "vitest";

const ARC_RPC_URL = "https://rpc.testnet.arc.io";
const MERCHANT_ADDRESS = process.env.ARC_MERCHANT_WALLET_ADDRESS;

describe("Arc merchant configuration", () => {
  it("accepts the configured public merchant address and reaches Arc RPC", async () => {
    expect(MERCHANT_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);

    const response = await fetch(ARC_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [MERCHANT_ADDRESS, "latest"],
      }),
    });

    expect(response.ok).toBe(true);
    const payload = await response.json() as { result?: string; error?: unknown };
    expect(payload.error).toBeUndefined();
    expect(payload.result).toMatch(/^0x[0-9a-f]+$/i);
  }, 15_000);
});
