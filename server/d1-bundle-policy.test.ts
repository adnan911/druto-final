import { describe, expect, it, vi } from "vitest";
import { d1BundlePolicy, forbiddenD1Module } from "../scripts/d1-bundle-policy";

describe("D1 browser bundle policy", () => {
  it.each([
    "/app/node_modules/@privy-io/react-auth/dist/index.js",
    "C:\\app\\node_modules\\.pnpm\\@privy-io+react-auth@3.37.4\\index.js",
    "/app/node_modules/x402/index.js",
    "/app/node_modules/.pnpm/decode-uri-component@0.2.2/index.js",
  ])("rejects a retired dependency: %s", id => {
    expect(forbiddenD1Module(id)).toBe(true);
  });

  it("allows the direct EVM wallet and Druto source modules", () => {
    for (const id of ["/app/node_modules/wagmi/index.js", "/app/node_modules/viem/index.js",
      "/app/client/src/main.tsx", "/app/client/src/privy-migration-notes.ts"]) {
      expect(forbiddenD1Module(id)).toBe(false);
    }
  });

  it("fails even when a forbidden dependency is only in a lazy chunk", () => {
    const plugin = d1BundlePolicy();
    const context = { error: (message: string) => { throw new Error(message); }, info: vi.fn() };
    const bundle = {
      "main.js": { type: "chunk", modules: { "/app/client/src/main.tsx": {} } },
      "lazy.js": { type: "chunk", modules: { "/app/node_modules/@privy-io/react-auth/index.js": {} } },
    };
    expect(() => (plugin.generateBundle as Function).call(context, {}, bundle))
      .toThrow("Retired authentication dependency");
  });
});
