import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { privateKeyToAccount } from "viem/accounts";

function createGuestContext(): { ctx: TrpcContext; setCookies: any[] } {
  const setCookies: any[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, setCookies };
}

describe("auth wallet procedures", () => {
  it("creates a wallet challenge and completes wallet login with valid signature", async () => {
    // Generate a test EVM account
    const testAccount = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const walletAddress = testAccount.address;

    const { ctx, setCookies } = createGuestContext();
    const caller = appRouter.createCaller(ctx);

    // 1. Create Challenge
    const challenge = await caller.auth.createWalletChallenge({ walletAddress });
    expect(challenge.challengeId).toMatch(/^wch_/);
    expect(challenge.message).toContain(walletAddress);

    // 2. Sign Challenge with test account
    const signature = await testAccount.signMessage({ message: challenge.message });

    // 3. Verify Login
    const loginResult = await caller.auth.verifyWalletLogin({
      challengeId: challenge.challengeId,
      walletAddress,
      signature,
    });

    expect(loginResult.authenticated).toBe(true);
    expect(loginResult.walletAddress.toLowerCase()).toBe(walletAddress.toLowerCase());
    expect(setCookies.length).toBeGreaterThanOrEqual(1);
  });
});
