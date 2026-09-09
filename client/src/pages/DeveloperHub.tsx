import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import SiteFooter from "@/components/SiteFooter";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  KeyRound,
  Layers3,
  Link2,
  Menu,
  PenTool,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  UserCheck,
  WalletCards,
  Webhook,
  X,
} from "lucide-react";

const logo = "/DRUTO_D_logo.png";
const sdkPackageUrl = "/manus-storage/druto-sdk-0.1.0_4dbf00a5.zip";
const sdkGuideUrl = "/manus-storage/GUIDE_60d3c182.md";

// Interactive API Request/Response Sandbox Component
function InteractiveApiSandbox() {
  const [lang, setLang] = useState<"typescript" | "curl" | "python" | "go">("typescript");
  const [endpoint, setEndpoint] = useState<"create_intent" | "get_intent" | "verify_webhook">("create_intent");
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeLatency, setActiveLatency] = useState(18);

  const requestCodes = {
    create_intent: {
      typescript: `import { Druto } from "@druto/sdk";

const druto = new Druto({ 
  apiKey: "druto_sec_test_92a8f...",
  network: "arc-testnet"
});

// Create server-signed Payment Intent
const intent = await druto.paymentIntents.create({
  amount: "45.00",
  asset: "USDC",
  network: "arc-testnet",
  externalOrderId: "ORDER_9281",
  seller: {
    marketplaceId: "market_northstar",
    sellerId: "artisan_42",
    walletAddress: "0x82f9A19b16B4912A3469a4D67e0eD6958E4541e9"
  },
  returnUrl: "https://shop.example/orders/9281"
});

console.log("Hosted checkout link:", intent.checkoutUrl);`,
      curl: `curl -X POST https://api.druto.finance/v1/payment-intents \\
  -H "Authorization: Bearer druto_sec_test_92a8f..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: ord_9281_seller_42" \\
  -d '{
    "amount": "45.00",
    "asset": "USDC",
    "network": "arc-testnet",
    "externalOrderId": "ORDER_9281",
    "seller": {
      "marketplaceId": "market_northstar",
      "sellerId": "artisan_42"
    },
    "returnUrl": "https://shop.example/orders/9281"
  }'`,
      python: `from druto import DrutoClient

client = DrutoClient(api_key="druto_sec_test_92a8f...", network="arc-testnet")

intent = client.payment_intents.create(
    amount="45.00",
    asset="USDC",
    external_order_id="ORDER_9281",
    seller_id="artisan_42",
    return_url="https://shop.example/orders/9281"
)

print(f"Checkout URL: {intent.checkout_url}")`,
      go: `package main

import (
    "fmt"
    "github.com/druto/druto-go"
)

func main() {
    client := druto.New("druto_sec_test_92a8f...", druto.WithNetwork("arc-testnet"))
    intent, err := client.PaymentIntents.Create(&druto.IntentParams{
        Amount:          "45.00",
        Asset:           "USDC",
        ExternalOrderID: "ORDER_9281",
        SellerID:        "artisan_42",
        ReturnURL:       "https://shop.example/orders/9281",
    })
    if err != nil {
        panic(err)
    }
    fmt.Printf("Checkout URL: %s\\n", intent.CheckoutURL)
}`,
    },
    get_intent: {
      typescript: `import { Druto } from "@druto/sdk";

const druto = new Druto({ apiKey: "druto_sec_test_92a8f..." });

// Retrieve current status and onchain verification state
const intent = await druto.paymentIntents.retrieve("pi_92a7f801bc44");

console.log("Status:", intent.status); // 'succeeded'
console.log("Arc Tx Hash:", intent.transactionHash);`,
      curl: `curl -X GET https://api.druto.finance/v1/payment-intents/pi_92a7f801bc44 \\
  -H "Authorization: Bearer druto_sec_test_92a8f..."`,
      python: `from druto import DrutoClient

client = DrutoClient(api_key="druto_sec_test_92a8f...")
intent = client.payment_intents.retrieve("pi_92a7f801bc44")
print(f"Status: {intent.status}, TxHash: {intent.transaction_hash}")`,
      go: `package main

import "github.com/druto/druto-go"

func main() {
    client := druto.New("druto_sec_test_92a8f...")
    intent, _ := client.PaymentIntents.Retrieve("pi_92a7f801bc44")
}`,
    },
    verify_webhook: {
      typescript: `import { verifyDrutoWebhook } from "@druto/sdk";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("druto-signature");

  const event = verifyDrutoWebhook({
    rawBody,
    signature,
    secret: process.env.DRUTO_WEBHOOK_SECRET!,
    toleranceSeconds: 300
  });

  if (event.type === "payment.verified") {
    // Fulfill order in your database
    await fulfillOrder(event.data.externalOrderId);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}`,
      curl: `# Test simulated webhook delivery
curl -X POST https://your-server.example/api/druto-webhook \\
  -H "druto-signature: t=1725745600,v1=9f83a21b3c847..." \\
  -H "Content-Type: application/json" \\
  -d '{"type":"payment.verified","id":"evt_01J7K8...","data":{"id":"pi_92a7f801bc44","status":"succeeded"}}'`,
      python: `from druto.webhooks import verify_signature

def webhook_handler(request):
    event = verify_signature(
        raw_body=request.body,
        signature=request.headers.get("druto-signature"),
        secret=os.environ["DRUTO_WEBHOOK_SECRET"]
    )
    if event.type == "payment.verified":
        fulfill_order(event.data.external_order_id)
    return {"status": "ok"}`,
      go: `package main

import (
    "net/http"
    "github.com/druto/druto-go/webhook"
)

func handleWebhook(w http.ResponseWriter, r *http.Request) {
    event, err := webhook.ConstructEvent(r, os.Getenv("DRUTO_WEBHOOK_SECRET"))
    if err != nil {
        http.Error(w, "Bad signature", 400)
        return
    }
    // process event.Data.ExternalOrderID
}`,
    }
  };

  const mockResponses = {
    create_intent: `{
  "id": "pi_92a7f801bc44",
  "object": "payment_intent",
  "status": "requires_payment",
  "amountAtomic": "45000000",
  "displayAmount": "45.00",
  "asset": "USDC",
  "network": "arc-testnet",
  "chainId": 5042002,
  "seller": {
    "marketplaceId": "market_northstar",
    "sellerId": "artisan_42",
    "walletAddress": "0x82f9A19b16B4912A3469a4D67e0eD6958E4541e9"
  },
  "checkoutUrl": "http://localhost:5173/checkout/pi_92a7f801bc44",
  "expiresAt": 1725749200,
  "createdAt": 1725745600
}`,
    get_intent: `{
  "id": "pi_92a7f801bc44",
  "object": "payment_intent",
  "status": "succeeded",
  "amountAtomic": "45000000",
  "displayAmount": "45.00",
  "asset": "USDC",
  "network": "arc-testnet",
  "chainId": 5042002,
  "transactionHash": "0x98dfa28394e7b1a03f84892c90234a47895bc10486c91a0c774b",
  "blockNumber": 14209124,
  "verifiedAt": 1725745618,
  "createdAt": 1725745600
}`,
    verify_webhook: `{
  "id": "evt_01J7K89P2AZW4X",
  "object": "event",
  "type": "payment.verified",
  "created": 1725745619,
  "data": {
    "id": "pi_92a7f801bc44",
    "status": "succeeded",
    "amount": "45.00",
    "asset": "USDC",
    "externalOrderId": "ORDER_9281",
    "transactionHash": "0x98dfa28394e7b1a03f84892c90234a47895bc10486c91a0c774b"
  }
}`
  };

  const runRequest = () => {
    setIsRunning(true);
    const simulatedLatency = Math.floor(Math.random() * 12) + 14;
    setActiveLatency(simulatedLatency);
    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
    }, 450);
  };

  const currentCode = requestCodes[endpoint][lang];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="devhub-sandbox-container interactive-luxury-card">
      {/* Endpoint Selector Subbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-mono">Endpoint:</span>
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg">
            <button
              onClick={() => setEndpoint("create_intent")}
              className={`px-3 py-1 rounded font-mono text-xs transition-colors ${
                endpoint === "create_intent" ? "bg-[#26463e] text-white font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              POST /v1/payment-intents
            </button>
            <button
              onClick={() => setEndpoint("get_intent")}
              className={`px-3 py-1 rounded font-mono text-xs transition-colors ${
                endpoint === "get_intent" ? "bg-[#26463e] text-white font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              GET /v1/payment-intents/:id
            </button>
            <button
              onClick={() => setEndpoint("verify_webhook")}
              className={`px-3 py-1 rounded font-mono text-xs transition-colors ${
                endpoint === "verify_webhook" ? "bg-[#26463e] text-white font-semibold shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Webhook /payment.verified
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Arc RPC Testnet: 5042002</span>
        </div>
      </div>

      <div className="sandbox-top-controls">
        <div className="sandbox-lang-tabs">
          {(["typescript", "curl", "python", "go"] as const).map((l) => (
            <button
              key={l}
              className={`sandbox-lang-btn ${lang === l ? "active" : ""}`}
              onClick={() => setLang(l)}
            >
              {l === "typescript" ? "TypeScript SDK" : l === "curl" ? "cURL REST" : l === "python" ? "Python" : "Go"}
            </button>
          ))}
        </div>
        <div className="sandbox-top-actions">
          <button className="sandbox-action-btn" onClick={copyCode}>
            <Clipboard size={13} /> {copied ? "Copied" : "Copy Code"}
          </button>
          <button className="button button-primary sandbox-run-btn" onClick={runRequest} disabled={isRunning}>
            {isRunning ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {isRunning ? "Executing..." : "Execute Test"}
          </button>
        </div>
      </div>

      <div className="sandbox-split-view">
        <div className="sandbox-pane request-pane">
          <div className="pane-tag">
            <span>Payload Request</span>
            <span className="font-mono text-[11px] text-slate-400">auth: Bearer druto_sec_...</span>
          </div>
          <pre><code>{currentCode}</code></pre>
        </div>
        <div className="sandbox-pane response-pane">
          <div className="pane-tag response-tag">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              JSON Output
            </span>
            <span className="status-200 font-mono">200 OK · {hasRun ? `${activeLatency}ms` : "Simulated"}</span>
          </div>
          <pre><code>{mockResponses[endpoint]}</code></pre>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="dev-code-block">
      <div className="dev-code-head">
        <span><span className="dev-code-dot" /> {language}</span>
        <button onClick={copy}><Clipboard size={13} /> {copied ? "Copied" : "Copy"}</button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="developer-doc-link">
      {children}
      <ChevronRight size={14} />
    </a>
  );
}

export default function DeveloperHub() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [errorQuery, setErrorQuery] = useState("");
  const [selectedErrorCode, setSelectedErrorCode] = useState<string>("invalid_return_url");
  const [activeStep, setActiveStep] = useState(1);
  const devAuraCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Background Aura Animation
  useEffect(() => {
    const canvas = devAuraCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 600);
    let time = 0;
    let animId: number;

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", handleResize);

    function animate() {
      if (!ctx) return;
      time += 0.0012;
      ctx.fillStyle = "#fdfdfb";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "multiply";

      const numFolds = 12;
      for (let i = 0; i < numFolds; i++) {
        const normalizedX = i / numFolds;
        const xPos = normalizedX * width + Math.sin(time * 1.5 + i) * (width * 0.1);
        const foldWidth = (width / numFolds) * 4;
        const waveIntensity = (Math.sin(time * 1.8 + i * 0.4) + 1) * 0.5;

        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, `rgba(253, 253, 251, 0)`);
        grad.addColorStop(0.5, `rgba(249, 212, 159, ${waveIntensity * 0.25})`);
        grad.addColorStop(1, `rgba(45, 74, 70, ${waveIntensity * 0.15})`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(xPos - foldWidth, 0);
        ctx.bezierCurveTo(xPos, height * 0.3, xPos - foldWidth, height * 0.7, xPos + foldWidth, height);
        ctx.lineTo(xPos + foldWidth * 2, height);
        ctx.bezierCurveTo(xPos + foldWidth, height * 0.7, xPos + foldWidth * 2, height * 0.3, xPos + foldWidth, 0);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      animId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const errors = [
    {
      code: "invalid_return_url",
      httpStatus: "400 BAD REQUEST",
      desc: "Use a valid HTTPS URL or relative path. Reject JavaScript and protocol-relative schemes.",
      remediation: "Validate returnUrl on your backend server before calling createIntent().",
    },
    {
      code: "idempotency_conflict",
      httpStatus: "409 CONFLICT",
      desc: "An idempotency key was reused with modified payload parameters (amount, seller, or order).",
      remediation: "Generate stable keys formatted as `orderId_sellerId_attempt`.",
    },
    {
      code: "seller_not_approved",
      httpStatus: "403 FORBIDDEN",
      desc: "The seller destination address has not completed the offchain signature challenge.",
      remediation: "Send the seller through the /developers/start onboarding challenge.",
    },
    {
      code: "webhook_signature_invalid",
      httpStatus: "401 UNAUTHORIZED",
      desc: "The HMAC-SHA256 signature in `druto-signature` does not match the computed hash.",
      remediation: "Ensure you use the raw unparsed request body string with the webhook secret.",
    },
    {
      code: "replay_detected",
      httpStatus: "422 UNPROCESSABLE",
      desc: "The event ID was already processed or timestamp exceeds 300s tolerance.",
      remediation: "Persist processed event IDs in your database for idempotency.",
    },
  ];

  const filteredErrors = errors.filter(
    (e) =>
      e.code.toLowerCase().includes(errorQuery.toLowerCase()) ||
      e.desc.toLowerCase().includes(errorQuery.toLowerCase())
  );

  return (
    <div className="antialiased selection:bg-[var(--accent)] selection:text-[var(--primary)] overflow-x-hidden text-[var(--foreground)] bg-[var(--background)] font-sans">
      {/* Navigation */}
      <nav className="fixed w-full z-50 border-b border-[var(--border)] top-0 right-0 left-0 bg-[var(--background)]/90 backdrop-blur-2xl transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="relative flex h-20 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center shrink-0 z-20">
              <Link href="/" className="flex items-center gap-3 group transition-transform duration-300 active:scale-95">
                <img src={logo} alt="Druto logo" className="h-9 w-auto object-contain" />
                <span className="text-xl font-bold tracking-tight text-[var(--foreground)] font-serif">druto</span>
              </Link>
            </div>

            {/* Right Actions */}
            <div className="flex gap-3 sm:gap-5 items-center ml-auto z-20">

              <Link
                href="/dashboard"
                className="group inline-flex items-center justify-center gap-2 transition-all duration-300 hover:opacity-90 sm:px-6 text-sm font-medium text-[var(--primary-foreground)] bg-[var(--primary)] h-11 rounded-full pr-5 pl-5 shadow-sm"
              >
                <span>Workspace</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>

              {/* Mobile Burger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
                className="lg:hidden flex items-center justify-center w-11 h-11 rounded-full border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--card)] transition-colors active:scale-95"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden pb-5 pt-2">
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-xl shadow-lg p-3 flex flex-col gap-1">
                <a href="#sandbox" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  API Sandbox
                </a>
                <a href="#quickstart" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Lifecycle Steps
                </a>
                <a href="#multi-seller" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Multi-Seller Routing
                </a>
                <a href="#webhooks" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Webhooks & Replays
                </a>
                <a href="#errors" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Error Codes
                </a>
                <Link href="/developers/start" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Start Guide
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Developer Hero */}
      <header className="lg:pt-36 lg:pb-20 overflow-hidden bg-[var(--background)] pt-28 pb-16 relative">
        <canvas ref={devAuraCanvasRef} className="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-60" />

        <div className="grid lg:grid-cols-2 max-w-7xl z-10 mx-auto px-6 relative gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs text-[var(--primary)] bg-[var(--card)] border border-[var(--border)] shadow-sm backdrop-blur-md">
              <Code2 size={14} className="text-[var(--primary)]" />
              <span className="font-medium tracking-wide uppercase">Arc Network Integration Platform</span>
            </div>

            <h1 className="lg:text-7xl leading-[1.08] text-5xl sm:text-6xl font-light text-[var(--foreground)] tracking-tighter font-serif mb-6">
              Build the payment flow <br />
              <span className="italic text-[var(--primary)] font-serif">your marketplace owns</span>
            </h1>

            <p className="text-lg sm:text-xl text-[var(--muted-foreground)] mb-8 leading-relaxed max-w-xl font-normal font-sans">
              Server-signed payment intents, offchain seller EIP-712 challenges, hosted checkout, and replay-safe webhooks for USDC on Arc.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 sm:items-center items-start">
              <Link
                href="/developers/start"
                className="px-8 py-3.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-all shadow-sm flex items-center gap-2"
              >
                Start Integration Guide <ArrowRight size={16} />
              </Link>
              <a
                href={sdkPackageUrl}
                className="px-8 py-3.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--sidebar-accent)] transition-all shadow-sm flex items-center gap-2"
              >
                <Download size={16} /> Download SDK (.zip)
              </a>
            </div>
          </div>

          {/* Right Integration Spec Card */}
          <aside
            className="bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] rounded-[2rem] p-8 shadow-xl interactive-luxury-card"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 mb-6">
              <span className="flex items-center gap-2 text-xs font-semibold font-mono text-[var(--primary)]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Integration Specification
              </span>
              <span className="text-xs font-mono text-[var(--muted-foreground)]">v1.0-arc</span>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <div className="flex justify-between items-center py-1 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Settlement Network</span>
                <strong className="text-[var(--foreground)] font-mono">Arc Testnet (Chain 5042002)</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Settlement Asset</span>
                <strong className="text-[var(--foreground)] font-mono">USDC (6 Decimals)</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Buyer Methods</span>
                <strong className="text-[var(--foreground)]">Injected EVM (MetaMask/Rabby) + QR</strong>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Routing Model</span>
                <strong className="text-[var(--primary)] font-medium">Server-Bound Direct Settlement</strong>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center gap-2 text-xs text-[var(--muted-foreground)] font-medium">
              <ShieldCheck size={16} className="text-[var(--primary)]" />
              <span>Cryptographic verification on Arc before order fulfillment</span>
            </div>
          </aside>
        </div>
      </header>


      {/* Interactive API Sandbox */}
      <section className="max-w-7xl mx-auto px-6 py-24" id="sandbox">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
            Interactive Test Sandbox
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
            Test the Payment Intent Contract Live
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
            Execute simulated requests across TypeScript, cURL, Python, and Go to preview exact 200 OK responses.
          </p>
        </div>

        <InteractiveApiSandbox />
      </section>

      {/* 6-Step Interactive Integration Stepper */}
      <section className="bg-[var(--card)]/40 border-y border-[var(--border)] py-20 sm:py-24 px-6" id="quickstart">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
              Integration Roadmap
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-3 tracking-tight leading-[1.2]">
              6 Steps from Setup to Production
            </h2>
            <p className="text-[var(--muted-foreground)] text-base sm:text-lg leading-relaxed font-sans">
              Click through the lifecycle below to inspect the deterministic code, payloads, and verification at each step.
            </p>
          </div>

          {/* Stepper Grid Container */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 6 Step Selector Cards */}
            <div className="lg:col-span-5 space-y-2.5">
              {[
                {
                  step: 1,
                  title: "Register Seller Identity",
                  badge: "Backend API",
                  icon: UserCheck,
                },
                {
                  step: 2,
                  title: "Offchain Signature Proof",
                  badge: "EIP-712 · Zero Gas",
                  icon: PenTool,
                },
                {
                  step: 3,
                  title: "Create Payment Intent",
                  badge: "Server Intent",
                  icon: KeyRound,
                },
                {
                  step: 4,
                  title: "Launch Hosted Checkout",
                  badge: "Buyer Flow",
                  icon: WalletCards,
                },
                {
                  step: 5,
                  title: "Arc Block Verification",
                  badge: "18ms Latency",
                  icon: ShieldCheck,
                },
                {
                  step: 6,
                  title: "Fulfill from Webhook",
                  badge: "HMAC Signed",
                  icon: Webhook,
                },
              ].map((item) => {
                const IconComponent = item.icon;
                const isSelected = activeStep === item.step;
                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => setActiveStep(item.step)}
                    className={`w-full text-left px-4 py-3 sm:py-3.5 rounded-2xl border transition-all duration-300 flex items-center gap-3.5 sleek-3d-card ${
                      isSelected
                        ? "active-step shadow-md"
                        : "border-[var(--border)] bg-[var(--card)]/80 hover:bg-[var(--card)] opacity-90 hover:opacity-100"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? "bg-white text-[var(--primary)] border-[var(--primary)]/30 shadow-sm"
                          : "bg-[var(--background)] text-[var(--primary)] border-[var(--border)]"
                      }`}
                    >
                      <IconComponent size={17} />
                    </div>

                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-[var(--foreground)] truncate font-sans">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] shrink-0">
                        {item.badge}
                      </span>
                    </div>

                    <span className="text-xs font-mono font-bold text-[var(--primary)] shrink-0 opacity-75 ml-1">
                      0{item.step}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Interactive Visual & Code Preview Pane */}
            <div className="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-6 sm:p-7 shadow-[0_16px_36px_-10px_rgba(45,74,70,0.08)]">
              {activeStep === 1 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm">
                        01
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--foreground)] font-sans">
                          Register Seller Identity
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] font-mono">
                          Endpoint: POST /v1/merchants/sellers
                        </p>
                      </div>
                    </div>
                    <DocLink href="/developers/start">Guide</DocLink>
                  </div>

                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                    Register your merchant or seller ID along with their intended Arc receiving address on your backend.
                  </p>

                  <div className="space-y-2">
                    <span className="text-xs font-mono text-[var(--primary)] font-semibold">Backend Implementation</span>
                    <CodeBlock
                      code={`// Register seller with their intended payout wallet
const seller = await druto.sellers.register({
  marketplaceId: "market_northstar",
  sellerId: "artisan_42",
  walletAddress: "0x82f9A19b16B4912A3469a4D67e0eD6958E4541e9",
  metadata: { storeName: "Artisan Woodworks" }
});`}
                      language="typescript"
                    />
                  </div>
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm">
                        02
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--foreground)] font-sans">
                          Offchain Signature Proof
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] font-mono">
                          Protocol: EIP-712 Typed Structured Data
                        </p>
                      </div>
                    </div>
                    <DocLink href="/developers/start">Challenge Specs</DocLink>
                  </div>

                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                    Seller connects their wallet and signs a domain-bound EIP-712 message to prove address ownership with zero gas.
                  </p>

                  <div className="space-y-2">
                    <span className="text-xs font-mono text-[var(--primary)] font-semibold">EIP-712 Challenge Payload</span>
                    <CodeBlock
                      code={`// Seller signs zero-gas typed payload in their wallet
const signature = await wallet.signTypedData({
  domain: { name: "Druto Gateway", version: "1", chainId: 5042002 },
  types: { OwnershipProof: [{ name: "sellerId", type: "string" }, { name: "timestamp", type: "uint256" }] },
  value: { sellerId: "artisan_42", timestamp: 1741517400 }
});`}
                      language="typescript"
                    />
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm">
                        03
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--foreground)] font-sans">
                          Create Payment Intent
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] font-mono">
                          Endpoint: POST /v1/payment-intents
                        </p>
                      </div>
                    </div>
                    <DocLink href="#sandbox">API Specs</DocLink>
                  </div>

                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                    Call Druto’s API to generate a server-authoritative checkout session with locked order context and seller address.
                  </p>

                  <div className="space-y-2">
                    <span className="text-xs font-mono text-[var(--primary)] font-semibold">Server-Side Request</span>
                    <CodeBlock
                      code={`const intent = await druto.paymentIntents.create({
  amount: "45.00",
  asset: "USDC",
  network: "arc-testnet",
  externalOrderId: "ORD_9281",
  sellerId: "artisan_42",
  idempotencyKey: "ord_9281_attempt_1"
});`}
                      language="typescript"
                    />
                  </div>
                </div>
              )}

              {activeStep === 4 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm">
                        04
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--foreground)] font-sans">
                          Launch Hosted Checkout
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] font-mono">
                          Redirect URL: https://pay.druto.finance/checkout/...
                        </p>
                      </div>
                    </div>
                    <DocLink href="#sandbox">Checkout Flow</DocLink>
                  </div>

                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                    Redirect buyer to the returned checkout URL. Buyer connects wallet and signs only the specified transfer.
                  </p>

                  <div className="p-4 bg-[var(--background)] rounded-2xl border border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)]">
                        <Link2 size={16} />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-[var(--foreground)] block">Hosted Checkout Session</span>
                        <span className="text-[11px] text-[var(--muted-foreground)] font-mono">intent.checkoutUrl</span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full">
                      Ready to Pay
                    </span>
                  </div>
                </div>
              )}

              {activeStep === 5 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm">
                        05
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--foreground)] font-sans">
                          Arc Block Verification
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] font-mono">
                          Network: Arc Testnet (Chain ID 5042002)
                        </p>
                      </div>
                    </div>
                    <DocLink href="#sandbox">State Machine</DocLink>
                  </div>

                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                    Druto monitors Arc Testnet for token contract matching, recipient confirmation, and finality receipt.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 bg-[var(--background)] rounded-xl border border-[var(--border)]">
                      <span className="text-[11px] text-[var(--muted-foreground)] block">Finality Latency</span>
                      <strong className="text-sm font-semibold text-emerald-700">~18ms Instant</strong>
                    </div>
                    <div className="p-3.5 bg-[var(--background)] rounded-xl border border-[var(--border)]">
                      <span className="text-[11px] text-[var(--muted-foreground)] block">Proof Mechanism</span>
                      <strong className="text-sm font-semibold text-[var(--foreground)]">EVM Merkle Block Receipt</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 6 && (
                <div className="space-y-5 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100/60 text-emerald-800 flex items-center justify-center font-mono font-bold text-sm">
                        06
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--foreground)] font-sans">
                          Fulfill from Signed Webhook
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)] font-mono">
                          Event: payment.verified (HMAC-SHA256)
                        </p>
                      </div>
                    </div>
                    <DocLink href="#webhooks">Webhook Docs</DocLink>
                  </div>

                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                    Verify HMAC signature on `payment.verified` and fulfill the order safely with zero browser trust.
                  </p>

                  <div className="space-y-2">
                    <span className="text-xs font-mono text-[var(--primary)] font-semibold">Webhook Handler Code</span>
                    <CodeBlock
                      code={`// Handle verified webhook on merchant server
app.post("/webhooks/druto", (req, res) => {
  const event = druto.webhooks.verifySignature(
    req.rawBody,
    req.headers["druto-signature"],
    process.env.DRUTO_WEBHOOK_SECRET
  );
  if (event.type === "payment.verified") {
    await fulfillOrder(event.data.externalOrderId);
  }
  res.json({ received: true });
});`}
                      language="typescript"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Multi-Seller Payment Routing */}
      <section className="max-w-7xl mx-auto px-6 py-24" id="multi-seller">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
            Multi-Vendor Engine
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
            Multi-Seller Orders: One Cart, Parallel Intents
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
            Group items by merchant on your backend. Druto executes parallel direct settlements with distinct receipts.
          </p>
        </div>

        {/* Luxury Animated Multi-Vendor Engine Canvas */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[2.2rem] p-6 sm:p-10 relative overflow-hidden shadow-[0_20px_50px_-15px_rgba(45,74,70,0.08)]">
          {/* Subtle Ambient Backdrops */}
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-64 rounded-full bg-[var(--primary)]/5 blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-64 h-64 rounded-full bg-[var(--accent)]/10 blur-3xl pointer-events-none" />

          {/* Top Live Engine Telemetry Pill */}
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border)] font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="font-semibold text-[var(--foreground)]">Atomic Multi-Vendor Router</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
              <span className="px-2.5 py-1 rounded-full bg-[var(--background)] border border-[var(--border)]">
                Parallel Execution
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                Active Stream
              </span>
            </div>
          </div>

          {/* Visual Flow Grid */}
          <div className="relative min-h-[300px] flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-8">
            {/* 1. Origin: Marketplace Cart */}
            <div className="w-full lg:w-64 p-5 rounded-2xl bg-[var(--background)] border border-[var(--border)] shadow-sm sleek-3d-card flex flex-col justify-between z-20 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                  <Layers3 size={20} />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 font-semibold">
                  1 Cart
                </span>
              </div>
              <div>
                <strong className="text-sm font-semibold text-[var(--foreground)] block font-sans mb-0.5">
                  Marketplace Cart
                </strong>
                <span className="text-xs text-[var(--muted-foreground)] font-mono block">
                  3 Items · $50.50 USDC Total
                </span>
              </div>
            </div>

            {/* Middle Animated Laser Channels (SVG on desktop, subtle connectors on mobile) */}
            <div className="hidden lg:block flex-1 h-[220px] relative z-10 w-full">
              <svg className="w-full h-full" viewBox="0 0 200 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="splitGrad1" x1="0%" y1="50%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#2d4a46" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#f9d49f" stopOpacity="1" />
                    <stop offset="100%" stopColor="#1e9b83" stopOpacity="0.8" />
                  </linearGradient>
                  <linearGradient id="splitGrad2" x1="0%" y1="50%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2d4a46" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#f9d49f" stopOpacity="1" />
                    <stop offset="100%" stopColor="#1e9b83" stopOpacity="0.8" />
                  </linearGradient>
                  <filter id="laserGlow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Static Guide Track */}
                <path d="M 0 110 C 100 110, 100 50, 200 50" fill="none" stroke="#2d4a46" strokeWidth="2" strokeOpacity="0.15" />
                <path d="M 0 110 C 100 110, 100 170, 200 170" fill="none" stroke="#2d4a46" strokeWidth="2" strokeOpacity="0.15" />

                {/* Animated Flow Lasers */}
                <path
                  d="M 0 110 C 100 110, 100 50, 200 50"
                  fill="none"
                  stroke="url(#splitGrad1)"
                  strokeWidth="3.5"
                  strokeDasharray="10 10"
                  className="flow-anim-active"
                  filter="url(#laserGlow)"
                />
                <path
                  d="M 0 110 C 100 110, 100 170, 200 170"
                  fill="none"
                  stroke="url(#splitGrad2)"
                  strokeWidth="3.5"
                  strokeDasharray="10 10"
                  className="flow-anim-active"
                  filter="url(#laserGlow)"
                />
              </svg>
            </div>

            {/* 2. Middle Destination: Parallel Intents */}
            <div className="w-full lg:w-72 space-y-3 z-20 shrink-0">
              {/* Intent 1 */}
              <div className="p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)] shadow-sm sleek-3d-card relative">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <strong className="text-xs font-semibold text-[var(--foreground)] font-sans">
                      Intent #1 (Artisan A)
                    </strong>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    $32.00 USDC
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>Seller Wallet:</span>
                  <span className="text-[var(--foreground)]">0x82f...41e9</span>
                </div>
              </div>

              {/* Intent 2 */}
              <div className="p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)] shadow-sm sleek-3d-card relative">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <strong className="text-xs font-semibold text-[var(--foreground)] font-sans">
                      Intent #2 (Studio B)
                    </strong>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    $18.50 USDC
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>Seller Wallet:</span>
                  <span className="text-[var(--foreground)]">0x3b1...7f02</span>
                </div>
              </div>
            </div>

            {/* Right Flow Connectors */}
            <div className="hidden lg:block flex-1 h-[220px] relative z-10 w-full">
              <svg className="w-full h-full" viewBox="0 0 200 220" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mergeGrad" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#1e9b83" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#f9d49f" stopOpacity="1" />
                    <stop offset="100%" stopColor="#2d4a46" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                <path d="M 0 50 C 100 50, 100 110, 200 110" fill="none" stroke="#2d4a46" strokeWidth="2" strokeOpacity="0.15" />
                <path d="M 0 170 C 100 170, 100 110, 200 110" fill="none" stroke="#2d4a46" strokeWidth="2" strokeOpacity="0.15" />

                <path
                  d="M 0 50 C 100 50, 100 110, 200 110"
                  fill="none"
                  stroke="url(#mergeGrad)"
                  strokeWidth="3.5"
                  strokeDasharray="10 10"
                  className="flow-anim-active"
                  filter="url(#laserGlow)"
                />
                <path
                  d="M 0 170 C 100 170, 100 110, 200 110"
                  fill="none"
                  stroke="url(#mergeGrad)"
                  strokeWidth="3.5"
                  strokeDasharray="10 10"
                  className="flow-anim-active"
                  filter="url(#laserGlow)"
                />
              </svg>
            </div>

            {/* 3. Output: Parallel Webhooks Fulfillment */}
            <div className="w-full lg:w-64 p-5 rounded-2xl bg-[var(--background)] border border-[var(--border)] shadow-sm sleek-3d-card flex flex-col justify-between z-20 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)] text-[var(--primary)] flex items-center justify-center shadow-sm">
                  <Webhook size={20} />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 font-semibold">
                  2 Dispatches
                </span>
              </div>
              <div>
                <strong className="text-sm font-semibold text-[var(--foreground)] block font-sans mb-0.5">
                  Parallel Webhooks
                </strong>
                <span className="text-xs text-[var(--muted-foreground)] font-sans block leading-relaxed">
                  Independent HMAC dispatches trigger atomic release for each seller.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Webhooks & Replay Safety */}
      <section className="bg-[var(--card)]/40 border-y border-[var(--border)] py-24 px-6" id="webhooks">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
              Fulfillment Security
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
              HMAC Signatures & Replay Prevention
            </h2>
            <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
              All webhook dispatches include timestamp validation and SHA-256 HMAC headers to guarantee authenticity.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-6 flex flex-col">
              <div className="h-full interactive-luxury-card flex flex-col">
                <CodeBlock
                  code={`import { verifyDrutoWebhook } from "@druto/sdk";

export async function handleWebhook(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("druto-signature");

  const event = verifyDrutoWebhook({
    rawBody,
    signature,
    secret: process.env.DRUTO_WEBHOOK_SECRET,
    toleranceSeconds: 300
  });

  if (event.type === "payment.verified" && !await isAlreadyFulfilled(event.id)) {
    await markOrderFulfilled(event.data.externalOrderId);
    await logProcessedEvent(event.id);
  }

  return new Response("OK", { status: 200 });
}`}
                />
              </div>
            </div>

            <div className="lg:col-span-6 bg-[var(--card)] p-6 sm:p-8 rounded-[2rem] border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between gap-4">
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)]/70 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shrink-0 shadow-sm">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <strong className="text-[var(--foreground)] text-sm font-semibold font-sans block mb-1">
                    Raw Body HMAC Verification
                  </strong>
                  <p className="text-[var(--muted-foreground)] text-xs leading-relaxed font-sans m-0">
                    Compute signature against the unparsed raw payload to prevent formatting discrepancies.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)]/70 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shrink-0 shadow-sm">
                  <KeyRound size={20} />
                </div>
                <div>
                  <strong className="text-[var(--foreground)] text-sm font-semibold font-sans block mb-1">
                    Timestamp Tolerance Window
                  </strong>
                  <p className="text-[var(--muted-foreground)] text-xs leading-relaxed font-sans m-0">
                    Druto rejects webhooks older than 300 seconds to protect against man-in-the-middle replays.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-2xl bg-[var(--background)] border border-[var(--border)]/70 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shrink-0 shadow-sm">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <strong className="text-[var(--foreground)] text-sm font-semibold font-sans block mb-1">
                    Durable Event Logging
                  </strong>
                  <p className="text-[var(--muted-foreground)] text-xs leading-relaxed font-sans m-0">
                    Persist event IDs in your database before fulfilling to guarantee exactly-once delivery.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Searchable Error Code Directory */}
      <section className="max-w-7xl mx-auto px-6 py-20 sm:py-24" id="errors">
        <div className="max-w-3xl mb-12">
          <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
            Error Directory
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-3 tracking-tight leading-[1.2]">
            Typed, Actionable Error Codes
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
            Search standard Druto API error responses and copy recommended remediation patterns.
          </p>
        </div>

        {/* Clean Interactive Error Inspector */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[2rem] p-6 sm:p-8 shadow-[0_16px_36px_-10px_rgba(45,74,70,0.06)]">
          {/* Search Input Bar */}
          <div className="relative mb-6">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search error codes (e.g. invalid_return_url, idempotency, signature)..."
              value={errorQuery}
              onChange={(e) => setErrorQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[var(--background)] border border-[var(--border)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] font-mono transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Error Code List */}
            <div className="lg:col-span-5 space-y-2">
              {filteredErrors.map((err) => {
                const isSelected = (selectedErrorCode || filteredErrors[0]?.code) === err.code;
                return (
                  <button
                    key={err.code}
                    type="button"
                    onClick={() => setSelectedErrorCode(err.code)}
                    className={`w-full text-left px-4 py-3 rounded-xl border font-mono text-xs transition-all duration-200 flex items-center justify-between gap-3 sleek-3d-card ${
                      isSelected
                        ? "active-step shadow-sm font-bold"
                        : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--sidebar-accent)] text-[var(--foreground)]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="truncate">{err.code}</span>
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)] font-sans uppercase tracking-wider shrink-0">
                      {err.httpStatus || "400 Bad Request"}
                    </span>
                  </button>
                );
              })}
              {filteredErrors.length === 0 && (
                <div className="p-8 text-center text-xs text-[var(--muted-foreground)] font-mono">
                  No matching error codes found for "{errorQuery}"
                </div>
              )}
            </div>

            {/* Right Selected Error Details Card */}
            {(() => {
              const currentErr = filteredErrors.find((e) => e.code === (selectedErrorCode || filteredErrors[0]?.code)) || filteredErrors[0];
              if (!currentErr) return null;
              return (
                <div className="lg:col-span-7 bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 space-y-5 animate-in fade-in duration-200">
                  <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-semibold">
                          {currentErr.httpStatus || "400 BAD REQUEST"}
                        </span>
                        <span className="text-xs font-mono text-[var(--muted-foreground)]">API Error</span>
                      </div>
                      <h3 className="font-mono text-base font-bold text-[var(--foreground)]">
                        {currentErr.code}
                      </h3>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-[var(--foreground)] block font-sans mb-1">Description</span>
                    <p className="text-xs sm:text-sm text-[var(--muted-foreground)] leading-relaxed font-sans">
                      {currentErr.desc}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <ShieldCheck size={15} className="text-[var(--primary)]" />
                      <span className="text-xs font-semibold text-[var(--foreground)] font-sans">Recommended Remediation</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] leading-relaxed font-sans">
                      {currentErr.remediation}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* SDK Kit & Downloads */}
      <section className="bg-[var(--card)]/40 border-t border-[var(--border)] py-24 px-6" id="sdk-kit">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-14">
            <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
              Downloads & Tooling
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
              SDK Packages and Starter Templates
            </h2>
            <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
              Get started with our pre-built TypeScript client and webhook receiver templates.
            </p>
          </div>

          <div className="kit-grid">
            <article className="interactive-luxury-card bg-[var(--card)] border border-[var(--border)]">
              <span className="kit-icon text-[var(--primary)]"><FileCode2 size={20} /></span>
              <h3 className="font-sans font-semibold text-base text-[var(--foreground)]">JavaScript / TypeScript SDK</h3>
              <p className="text-xs text-[var(--muted-foreground)] font-sans">Typed checkout client, signature verification, request builders, and test fixtures.</p>
              <div className="kit-actions">
                <Link href="/developers/start" className="button button-primary">
                  View Quickstart Guide <ArrowRight size={14} />
                </Link>
                <a href="#sandbox" className="button button-quiet">
                  API Sandbox <Code2 size={13} />
                </a>
              </div>
            </article>

            <article className="interactive-luxury-card bg-[var(--card)] border border-[var(--border)]">
              <span className="kit-icon text-[var(--primary)]"><Terminal size={20} /></span>
              <h3 className="font-sans font-semibold text-base text-[var(--foreground)]">REST API Contract</h3>
              <p className="text-xs text-[var(--muted-foreground)] font-sans">Complete OpenAPI schema, field definitions, idempotency specs, and error states.</p>
              <a href="#sandbox" className="button button-quiet">
                Explore Sandbox <ArrowRight size={14} />
              </a>
            </article>

            <article className="interactive-luxury-card bg-[var(--card)] border border-[var(--border)]">
              <span className="kit-icon text-[var(--primary)]"><WalletCards size={20} /></span>
              <h3 className="font-sans font-semibold text-base text-[var(--foreground)]">Seller Onboarding Kit</h3>
              <p className="text-xs text-[var(--muted-foreground)] font-sans">EIP-712 challenge generator, address binding templates, and admin review workflows.</p>
              <Link href="/developers/start" className="button button-quiet">
                Start Seller Setup <ArrowRight size={14} />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* Modern Themed Site Footer */}
      <SiteFooter />
    </div>
  );
}
