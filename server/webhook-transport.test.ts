import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicWebhookIp, postPinnedWebhook, postWorkerWebhook, resolvePublicWebhookAddress } from "./webhook-transport";
import { verifyWebhookSignature } from "./webhooks";

beforeEach(() => vi.stubEnv("DRUTO_WEBHOOK_ALLOWED_ORIGINS", "https://market.example"));
afterEach(() => vi.unstubAllEnvs());

describe("pinned webhook transport", () => {
  it.each([
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
    "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1",
  ])("rejects a non-public IP: %s", address => expect(isPublicWebhookIp(address)).toBe(false));

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("accepts a public IP: %s", address =>
    expect(isPublicWebhookIp(address)).toBe(true));

  it("rejects the entire DNS answer set if even one address is private", async () => {
    const resolveDns = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }, { address: "169.254.169.254", family: 4 }]);
    await expect(resolvePublicWebhookAddress("market.example", resolveDns)).rejects.toThrow("public addresses");
    expect(resolveDns).toHaveBeenCalledWith("market.example", { all: true, verbatim: true });
  });

  it("pins the vetted IP while preserving hostname TLS verification and the exact signature", async () => {
    let options: RequestOptions | undefined;
    let sentBody = "";
    const requestHttps = vi.fn((_url: URL, requestOptions: RequestOptions, onResponse: (response: any) => void) => {
      options = requestOptions;
      const request = new EventEmitter() as EventEmitter & { end: (body: string) => void };
      request.end = body => {
        sentBody = body;
        onResponse({ statusCode: 200, destroy: vi.fn() });
      };
      return request;
    });
    const payload = '{"order":1}';
    const result = await postPinnedWebhook("https://market.example/hooks", "secret", "evt_1", payload, {
      resolveDns: async () => [{ address: "8.8.8.8", family: 4 }],
      requestHttps: requestHttps as unknown as typeof import("node:https").request,
    });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(requestHttps).toHaveBeenCalledOnce();
    expect((requestHttps.mock.calls[0] as unknown as [URL])[0].hostname).toBe("market.example");
    expect(options).toMatchObject({ agent: false, servername: "market.example", rejectUnauthorized: true, family: 4, method: "POST" });
    const headers = options!.headers as Record<string, string>;
    expect(headers["x-druto-event-id"]).toBe("evt_1");
    expect(verifyWebhookSignature("secret", sentBody, headers["druto-signature"])).toBe(true);
    expect(headers["content-length"]).toBe(Buffer.byteLength(payload));
    const lookup = options!.lookup!;
    lookup("market.example", {}, (_error, ip, family) => {
      expect(ip).toBe("8.8.8.8");
      expect(family).toBe(4);
    });
  });

  it("never calls HTTPS when DNS resolves to metadata or a mixed answer set", async () => {
    const requestHttps = vi.fn();
    const result = await postPinnedWebhook("https://market.example/hooks", "secret", "evt_1", "{}", {
      resolveDns: async () => [{ address: "169.254.169.254", family: 4 }],
      requestHttps: requestHttps as unknown as typeof import("node:https").request,
    });
    expect(result).toMatchObject({ ok: false, status: 0 });
    expect(requestHttps).not.toHaveBeenCalled();
  });

  it("treats HTTP redirects as receiver failures without making another request", async () => {
    const requestHttps = vi.fn((_url: URL, _options: RequestOptions, onResponse: (response: any) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void };
      request.end = () => onResponse({ statusCode: 302, destroy: vi.fn() });
      return request;
    });
    const result = await postPinnedWebhook("https://market.example/hooks", "secret", "evt_1", "{}", {
      resolveDns: async () => [{ address: "8.8.8.8", family: 4 }],
      requestHttps: requestHttps as unknown as typeof import("node:https").request,
    });
    expect(result).toEqual({ ok: false, status: 302, error: "Receiver returned HTTP 302" });
    expect(requestHttps).toHaveBeenCalledOnce();
  });
});

describe("Cloudflare webhook transport", () => {
  it("signs an allowlisted request and refuses redirects", async () => {
    const requestFetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 302 }));
    const payload = '{"order":1}';
    const result = await postWorkerWebhook("https://market.example/hooks", "secret", "evt_cf", payload, requestFetch as typeof fetch);
    expect(result).toEqual({ ok: false, status: 302, error: "Receiver returned HTTP 302" });
    expect(requestFetch).toHaveBeenCalledOnce();
    const [url, init] = requestFetch.mock.calls[0];
    expect(url).toBe("https://market.example/hooks");
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("POST");
    expect(verifyWebhookSignature("secret", payload, (init.headers as Record<string, string>)["druto-signature"])).toBe(true);
  });

  it("never fetches unapproved origins or IP literals", async () => {
    const requestFetch = vi.fn();
    for (const url of ["https://other.example/hooks", "https://169.254.169.254/hooks", "http://market.example/hooks"]) {
      expect((await postWorkerWebhook(url, "secret", "evt_cf", "{}", requestFetch as typeof fetch)).ok).toBe(false);
    }
    expect(requestFetch).not.toHaveBeenCalled();
  });
});
