import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ pinataJwt: "", pinataGateway: "", forgeApiUrl: "", forgeApiKey: "" }));
vi.mock("./_core/env", () => ({ ENV: env }));
import { storageGet, storagePut } from "./storage";

afterEach(() => {
  Object.assign(env, { pinataJwt: "", pinataGateway: "", forgeApiUrl: "", forgeApiKey: "" });
  vi.unstubAllGlobals();
});

describe("storage persistence", () => {
  it("rejects uploads when no backend can save them", async () => {
    await expect(storagePut("image.png", "bytes")).rejects.toThrow("no backend successfully persisted");
  });

  it("returns a retrievable CID key for Pinata uploads", async () => {
    env.pinataJwt = "test-token";
    const cid = `Qm${"a".repeat(44)}`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ IpfsHash: cid }) }));
    const uploaded = await storagePut("image.png", "bytes");
    expect(uploaded).toEqual({ key: cid, url: `https://gateway.pinata.cloud/ipfs/${cid}` });
    expect(await storageGet(uploaded.key)).toEqual({ key: cid, url: `/manus-storage/${cid}` });
  });
});
