import { describe, expect, it } from "vitest";
import { checkoutWalletError } from "./walletError";

describe("checkout wallet errors", () => {
  it("does not expose a wallet RPC HTML page to the buyer", () => {
    const message = checkoutWalletError(new Error("<html><body>Cloudflare request failed; secret data</body></html>"), false);
    expect(message).toContain("Arc Testnet RPC");
    expect(message).not.toMatch(/Cloudflare|html|secret data/i);
  });

  it("never prompts another transfer after a transaction hash exists", () => {
    expect(checkoutWalletError(new Error("verification failed"), true)).toContain("do not send another payment");
  });
});
