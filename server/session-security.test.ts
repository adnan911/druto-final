import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
const db = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), upsertUser: vi.fn() }));
vi.mock("./db", () => db);
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({ openId: "wallet-test", name: "Test", appId: ENV.appId, sessionVersion: 2, ...overrides })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h")
    .sign(new TextEncoder().encode(ENV.cookieSecret));
}
describe("session security", () => {
  it("accepts newly issued sessions including empty display names", async () => {
    expect(await sdk.verifySession(await sdk.createSessionToken("wallet-test"))).toMatchObject({ openId: "wallet-test" });
  });
  it.each([
    { sessionVersion: 1 }, { appId: "another-app" }, { openId: "druto-operator-old-account" },
  ])("rejects obsolete or invalid session claims %j", async claims => {
    expect(await sdk.verifySession(await token(claims))).toBeNull();
  });
  it("ignores historical admin grants for ordinary identities", async () => {
    db.getUserByOpenId.mockResolvedValue({ id: 4, openId: "wallet-test", role: "admin", loginMethod: "wallet" });
    const result = await sdk.authenticateRequest({ headers: { authorization: `Bearer ${await token()}` } } as any);
    expect(result.role).toBe("user");
  });
  it("rejects database identity mismatches", async () => {
    db.getUserByOpenId.mockResolvedValue({ id: 1, openId: "someone-else", role: "admin" });
    await expect(sdk.authenticateRequest({ headers: { authorization: `Bearer ${await token()}` } } as any)).rejects.toThrow("Unverified account identity");
  });
});
