import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Clipboard, Download, ExternalLink, ShieldCheck, WalletCards, Webhook } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

const archive = "/downloads/druto-sdk-0.2.0-testnet.2.zip";
const checksum = `${archive}.sha256`;
const serverCode = `import { Druto } from "@druto/sdk";

// Server or Cloudflare Worker only. Never put an API key in browser code.
const druto = new Druto({ apiKey: process.env.DRUTO_API_KEY! });
const session = await druto.createPayment({
  externalOrderId: "order_123",
  idempotencyKey: "order_123_seller_456_v1",
  itemName: "Example order",
  amount: "1.00", // calculate from your trusted catalog
  seller: { marketplaceId: "market_abc", sellerId: "seller_456" },
  returnUrl: "https://shop.example/orders/order_123",
});
// Send only session.checkoutUrl to the buyer browser.`;
const webhookCode = `import { verifyPaymentWebhook } from "@druto/sdk";

const rawBody = await request.text();
const event = await verifyPaymentWebhook({
  secret: process.env.DRUTO_WEBHOOK_SECRET!,
  rawBody,
  signature: request.headers.get("druto-signature") ?? "",
  eventId: request.headers.get("x-druto-event-id") ?? undefined,
});
if (!event) return new Response("invalid event", { status: 401 });
// In one DB transaction, verify your order details, deduplicate event.id,
// mark paid, and enqueue fulfillment exactly once.
await settleOrderOnce(event);
return new Response("ok", { status: 200 });`;

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  }
  return <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-slate-950 text-slate-100 shadow-lg">
    <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3 text-xs text-slate-300">
      <span>{label}</span><button onClick={copy} className="inline-flex items-center gap-2 hover:text-white" aria-label={`Copy ${label}`}>
        {copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy"}
      </button>
    </div>
    <pre className="overflow-x-auto p-5 text-xs leading-6"><code>{code}</code></pre>
  </div>;
}

export default function DeveloperHub() {
  return <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <nav className="border-b border-[var(--border)] bg-[var(--background)]/95 px-6 py-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" aria-label="Druto home"><img src="/druto_logo_full.png" alt="Druto" className="h-12 w-auto" /></Link>
        <Link href="/dashboard" className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm text-[var(--primary-foreground)]">Seller dashboard</Link>
      </div>
    </nav>
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-14">
      <div className="max-w-3xl">
        <span className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold uppercase tracking-wide">Arc Testnet integration</span>
        <h1 className="mt-7 font-serif text-4xl leading-tight sm:text-6xl">Accept USDC with Druto hosted checkout</h1>
        <p className="mt-6 text-lg leading-8 text-[var(--muted-foreground)]">Download the versioned JavaScript/TypeScript SDK for a marketplace server or Cloudflare Worker. It creates one seller-bound payment session, redirects the buyer to Druto, and verifies signed payment webhooks.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={archive} download className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--primary-foreground)]"><Download size={17} /> Download SDK v0.2.0-testnet.2</a>
          <a href={checksum} download className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-6 py-3 text-sm">SHA-256 checksum <ExternalLink size={15} /></a>
        </div>
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Public package; no API key inside. Unzip and run <code className="rounded bg-[var(--card)] px-1.5 py-0.5">npm install ./druto-sdk</code>. Not published to npm yet.</p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"><WalletCards className="text-[var(--primary)]" /><h2 className="mt-4 text-xl font-semibold">One seller, one intent</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Verified seller wallet is resolved by Druto. Multi-seller carts need separate intents; split payments are not available.</p></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"><ShieldCheck className="text-[var(--primary)]" /><h2 className="mt-4 text-xl font-semibold">Server-side API key</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Keep the seller-scoped key in your server secret store. Reuse an idempotency key only for an unchanged order.</p></div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"><Webhook className="text-[var(--primary)]" /><h2 className="mt-4 text-xl font-semibold">Signed fulfillment</h2><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Verify the raw webhook body, timestamp, seller, amount and recipient. Deduplicate event IDs in your database.</p></div>
      </div>

      <div className="mt-16 grid items-start gap-10 lg:grid-cols-2">
        <section><h2 className="mb-5 font-serif text-3xl">1. Create checkout on your server</h2><CodeBlock label="TypeScript · server only" code={serverCode} /><p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">Druto currently exposes this through <code>payments.createIntent</code>. The SDK hides the tRPC transport and rejects a response with the wrong network, fee, seller, amount, or checkout origin.</p></section>
        <section><h2 className="mb-5 font-serif text-3xl">2. Verify before fulfillment</h2><CodeBlock label="TypeScript · webhook handler" code={webhookCode} /><p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">A return URL, wallet popup, or submitted transaction hash is not proof of payment. Your order database must make fulfillment idempotent.</p></section>
      </div>

      <div className="mt-16 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-7 sm:p-10">
        <h2 className="font-serif text-3xl">Current release boundary</h2>
        <p className="mt-4 max-w-4xl leading-7 text-[var(--muted-foreground)]">This SDK is for Arc <strong>Testnet</strong> USDC direct-to-seller payments with a 0% platform fee. Hosted buyer checkout can use an EVM wallet or QR handoff. It does not provide mainnet payments, fiat conversion, subscriptions, payment links, automatic refunds, split settlement, or country-level authorization. Do not use it for real customer funds.</p>
        <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 font-semibold text-[var(--primary)]">Verify seller and create a scoped key <ArrowRight size={16} /></Link>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
