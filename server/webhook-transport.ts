import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { buildWebhookHeaders, isAllowedWebhookOrigin, signWebhookPayload, type WebhookDeliveryResult } from "./webhooks";

type ResolveDns = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupAddress[]>;
type WebhookTransportDependencies = { resolveDns?: ResolveDns; requestHttps?: typeof httpsRequest };

/** Workers fetch is restricted by Cloudflare to public HTTP destinations. Keep
 * the exact operator origin allowlist and reject redirects at this boundary. */
export async function postWorkerWebhook(
  url: string, secret: string, eventId: string, payload: string,
  requestFetch: typeof fetch = fetch,
): Promise<WebhookDeliveryResult> {
  if (!isAllowedWebhookOrigin(url)) return { ok: false, status: 0, error: "Webhook origin is not enabled by the operator" };
  try {
    const signed = signWebhookPayload(secret, payload);
    const response = await requestFetch(url, {
      method: "POST",
      headers: buildWebhookHeaders(eventId, signed),
      body: payload,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 300
      ? { ok: true, status: response.status }
      : { ok: false, status: response.status, error: `Receiver returned HTTP ${response.status}` };
  } catch {
    return { ok: false, status: 0, error: "Webhook request failed or timed out" };
  }
}

// DNS answers must be globally routable. ipaddr.js classifies most special-use
// ranges; add 198.18/15 (benchmarking) and require IPv6 global unicast space.
export function isPublicWebhookIp(address: string): boolean {
  if (!isIP(address)) return false;
  const parsed = ipaddr.process(address);
  if (parsed.kind() === "ipv4") {
    const ipv4 = parsed as ipaddr.IPv4;
    return ipv4.range() === "unicast" && !ipv4.match(ipaddr.IPv4.parse("198.18.0.0"), 15);
  }
  const ipv6 = parsed as ipaddr.IPv6;
  return ipv6.range() === "unicast" && ipv6.match(ipaddr.IPv6.parse("2000::"), 3);
}

export async function resolvePublicWebhookAddress(hostname: string, resolveDns: ResolveDns = dnsLookup): Promise<LookupAddress> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const answers = await Promise.race([
    resolveDns(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Webhook DNS lookup timed out")), 3_000); }),
  ]).finally(() => { if (timeout) clearTimeout(timeout); });
  if (!answers.length || answers.length > 32 || answers.some(answer =>
    isIP(answer.address) !== answer.family || !isPublicWebhookIp(answer.address))) {
    throw new Error("Webhook destination did not resolve exclusively to public addresses");
  }
  return answers[0];
}

export async function postPinnedWebhook(
  url: string, secret: string, eventId: string, payload: string,
  dependencies: WebhookTransportDependencies = {},
): Promise<WebhookDeliveryResult> {
  if (process.env.DRUTO_RUNTIME === "cloudflare") {
    return postWorkerWebhook(url, secret, eventId, payload);
  }
  if (!isAllowedWebhookOrigin(url)) return { ok: false, status: 0, error: "Webhook origin is not enabled by the operator" };
  const target = new URL(url);
  let address: LookupAddress;
  try {
    address = await resolvePublicWebhookAddress(target.hostname, dependencies.resolveDns);
  } catch {
    return { ok: false, status: 0, error: "Webhook destination DNS is unavailable or non-public" };
  }
  const signed = signWebhookPayload(secret, payload);
  const requestHttps = dependencies.requestHttps ?? httpsRequest;
  return new Promise(resolve => {
    let settled = false;
    const finish = (result: WebhookDeliveryResult) => { if (!settled) { settled = true; resolve(result); } };
    try {
      const request = requestHttps(target, {
        method: "POST",
        headers: { ...buildWebhookHeaders(eventId, signed), "content-length": Buffer.byteLength(payload) },
        // Keep the URL hostname for Host and certificate verification, but hand
        // the socket only the IP that passed validation. No second DNS lookup.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
        family: address.family,
        agent: false,
        servername: target.hostname,
        rejectUnauthorized: true,
        maxHeaderSize: 16_384,
        signal: AbortSignal.timeout(10_000),
      }, response => {
        const status = response.statusCode ?? 0;
        finish(status >= 200 && status < 300
          ? { ok: true, status }
          : { ok: false, status, error: `Receiver returned HTTP ${status}` });
        response.destroy(); // Never follow redirects or buffer untrusted response bodies.
      });
      request.on("error", () => finish({ ok: false, status: 0, error: "Webhook request failed or timed out" }));
      request.end(payload);
    } catch {
      finish({ ok: false, status: 0, error: "Webhook request failed or timed out" });
    }
  });
}
