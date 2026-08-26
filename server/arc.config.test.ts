import { describe, expect, it } from "vitest";

const ARC_RPC_URL = "https://rpc.testnet.arc.io";
const MERCHANT_ADDRESS = process.env.ARC_MERCHANT_WALLET_ADDRESS;

describe("Arc merchant configuration", () => {
  it("accepts the configured public merchant address and Arc RPC", () => {
    expect(MERCHANT_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(ARC_RPC_URL).toBe("https://rpc.testnet.arc.io");
  });
});
