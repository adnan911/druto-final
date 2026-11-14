import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../workers/webhook-cron/index.mjs";

const env = {
  DRUTO_DRAIN_URL: "https://druto-preview.example/api/internal/webhook-outbox/drain",
  DRUTO_OUTBOX_DRAIN_TOKEN: "ab".repeat(32),
  VERCEL_AUTOMATION_BYPASS_SECRET: "preview-bypass",
};

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare webhook scheduler", () => {
  it("never exposes an HTTP trigger and rejects unsafe URL or absent credentials", async () => {
    expect((await worker.fetch()).status).toBe(404);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(worker.scheduled({}, { ...env, DRUTO_OUTBOX_DRAIN_TOKEN: "" })).rejects.toThrow("token");
    await expect(worker.scheduled({}, { ...env, DRUTO_DRAIN_URL: "http://druto-preview.example/api/internal/webhook-outbox/drain" })).rejects.toThrow("exact HTTPS");
    await expect(worker.scheduled({}, { ...env, DRUTO_DRAIN_URL: `${env.DRUTO_DRAIN_URL}?secret=bad` })).rejects.toThrow("exact HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls only the protected endpoint with a bounded request and aggregate logs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, selected: 1, delivered: 1, failedOrSkipped: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await worker.scheduled({}, env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.href).toBe(env.DRUTO_DRAIN_URL);
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.headers.authorization).toBe(`Bearer ${env.DRUTO_OUTBOX_DRAIN_TOKEN}`);
    expect(options.headers["x-vercel-protection-bypass"]).toBe(env.VERCEL_AUTOMATION_BYPASS_SECRET);
  });

  it("surfaces HTTP errors and failed deliveries as cron failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, selected: 1, delivered: 0, failedOrSkipped: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(worker.scheduled({}, env)).rejects.toThrow("HTTP 401");
    await expect(worker.scheduled({}, env)).rejects.toThrow("deliveries failed");
  });
});
