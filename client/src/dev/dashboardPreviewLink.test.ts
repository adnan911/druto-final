import { afterEach, describe, expect, it, vi } from "vitest";
import { createTRPCUntypedClient } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import { dashboardPreviewLink } from "./dashboardPreviewLink";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("development dashboard transport isolation", () => {
  it("refuses even sample queries when the development gate is off", async () => {
    vi.stubEnv("DEV", false);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = createTRPCUntypedClient<AppRouter>({ links: [dashboardPreviewLink()] });
    await expect(client.query("auth.me")).rejects.toThrow("only during development");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("serves cloned sample data, filters it, and never calls fetch", async () => {
    const fetch = vi.fn(() => { throw new Error("No network allowed"); });
    vi.stubGlobal("fetch", fetch);
    const client = createTRPCUntypedClient<AppRouter>({ links: [dashboardPreviewLink()] });
    const first = await client.query("payments.summary") as { grossUsdc: string };
    first.grossUsdc = "tampered";
    expect(await client.query("payments.summary")).toMatchObject({ grossUsdc: "915.00" });
    const page = await client.query("payments.verifiedPaymentsPage", { search: "catalog" }) as { items: unknown[] };
    expect(page.items).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects every mutation and unknown query without a backend fallback", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const client = createTRPCUntypedClient<AppRouter>({ links: [dashboardPreviewLink()] });
    for (const path of ["auth.verifyWalletLogin", "auth.updateProfile", "payments.createIntent", "apiKeys.create", "apiKeys.revoke", "merchantAccounts.register", "merchantAccounts.retryWebhook"]) {
      await expect(client.mutation(path, {})).rejects.toThrow("Preview is read-only");
    }
    await expect(client.query("unlisted.procedure")).rejects.toThrow("no sample fixture");
    expect(fetch).not.toHaveBeenCalled();
  });
});