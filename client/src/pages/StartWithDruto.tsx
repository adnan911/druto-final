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
  Copy,
  Download,
  ExternalLink,
  KeyRound,
  Layers,
  LockKeyhole,
  Menu,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Terminal,
  WalletCards,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { copyTextToClipboard, type CopyFeedback } from "@/lib/clipboard";

const logo = "/DRUTO_D_logo.png";
const starterZipUrl = "/manus-storage/druto-nextjs-starter-0.1.0_b97da8c9.zip";
const sdkPackageUrl = "/manus-storage/druto-sdk-0.1.0_4dbf00a5.zip";

const installSnippet = `# Install Druto SDK for Node.js / TypeScript
npm install @druto/sdk

# Or using pnpm
pnpm add @druto/sdk`;

const serverSnippet = `import { Druto } from "@druto/sdk";

// 1. Initialize with your server API key
const druto = new Druto({
  apiKey: process.env.DRUTO_API_KEY!,
  network: "arc-testnet"
});

// 2. Create Payment Intent from your checkout route
export async function createCheckoutSession(order: Order) {
  const intent = await druto.paymentIntents.create({
    amount: order.totalUsdc, // e.g. "45.00"
    asset: "USDC",
    network: "arc-testnet",
    externalOrderId: order.id,
    seller: {
      marketplaceId: "market_northstar",
      sellerId: order.sellerId,
      walletAddress: order.sellerWalletAddress
    },
    returnUrl: \`https://yourshop.example/orders/\${order.id}\`
  });

  return { checkoutUrl: intent.checkoutUrl };
}`;

const webhookSnippet = `import { verifyDrutoWebhook } from "@druto/sdk";

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
    await db.orders.update({
      where: { id: event.data.externalOrderId },
      data: { status: "PAID", txHash: event.data.transactionHash }
    });
  }

  return new Response("OK", { status: 200 });
}`;

function CopyBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  const [feedback, setFeedback] = useState<CopyFeedback>("idle");
  const copy = async () => {
    const succeeded = await copyTextToClipboard(code);
    setFeedback(succeeded ? "copied" : "error");
    window.setTimeout(() => setFeedback("idle"), 1800);
  };
  const label = feedback === "copied" ? "Copied" : feedback === "error" ? "Select manually" : "Copy";
  const Icon = feedback === "copied" ? Check : Clipboard;

  return (
    <div className="dev-code-block">
      <div className="dev-code-head">
        <span><span className="dev-code-dot" /> {language}</span>
        <button type="button" onClick={copy} aria-label={`Copy ${language} code`}>
          <Icon size={13} /> {label}
        </button>
      </div>
      <pre><code>{code}</code></pre>
      <span className="sr-only" role="status" aria-live="polite">
        {feedback === "copied" ? "Code copied to clipboard." : feedback === "error" ? "Copy failed. Select the code manually." : ""}
      </span>
    </div>
  );
}

export default function StartWithDruto() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const auraCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Background Aura Animation
  useEffect(() => {
    const canvas = auraCanvasRef.current;
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

      const numFolds = 10;
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

  return (
    <div className="antialiased selection:bg-[var(--accent)] selection:text-[var(--primary)] overflow-x-hidden text-[var(--foreground)] bg-[var(--background)] font-sans">
      {/* Navigation */}
      <nav className="fixed w-full z-50 border-b border-[var(--border)] top-0 right-0 left-0 bg-[var(--background)]/90 backdrop-blur-2xl transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="relative flex h-20 md:h-24 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center shrink-0 z-20">
              <Link href="/" className="flex items-center group transition-transform duration-300 active:scale-95">
                <img src="/druto_logo_full.png" alt="Druto" className="h-16 md:h-[72px] w-auto object-contain -translate-y-1.5" />
              </Link>
            </div>

            {/* Right Actions */}
            <div className="flex gap-3 sm:gap-5 items-center ml-auto z-20">

              <Link
                href="/dashboard"
                className="group inline-flex items-center justify-center gap-2 transition-all duration-300 hover:opacity-90 sm:px-6 text-sm font-medium text-[var(--primary-foreground)] bg-[var(--primary)] h-11 rounded-full pr-5 pl-5 shadow-sm"
              >
                <span>Launch App</span>
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
                <Link href="/developers" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Developer Hub
                </Link>
                <a href="#quickstart" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Quickstart
                </a>
                <a href="#credentials" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Credentials
                </a>
                <a href="#backend" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Backend Adapter
                </a>
                <a href="#webhooks" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Webhooks
                </a>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--primary)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Open Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Start Hero */}
      <header className="lg:pt-36 lg:pb-20 overflow-hidden bg-[var(--background)] pt-28 pb-16 relative">
        <canvas ref={auraCanvasRef} className="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-60" />

        <div className="grid lg:grid-cols-2 max-w-7xl z-10 mx-auto px-6 relative gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs text-[var(--primary)] bg-[var(--card)] border border-[var(--border)] shadow-sm backdrop-blur-md">
              <Rocket size={14} className="text-[var(--primary)]" />
              <span className="font-medium tracking-wide uppercase">New Merchant & Seller Quickstart</span>
            </div>

            <h1 className="lg:text-7xl leading-[1.1] text-5xl sm:text-6xl font-normal text-[var(--foreground)] tracking-tighter font-serif mb-6">
              Start accepting USDC <br />
              <span className="italic text-[var(--primary)] font-serif">in a few clear steps</span>
            </h1>

            <p className="text-lg sm:text-xl text-[var(--muted-foreground)] mb-8 leading-relaxed max-w-xl font-normal font-sans">
              Connect your website or marketplace to Druto without managing private keys. Create server-side Payment Intents, launch hosted checkout, and fulfill on verified Arc events.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 sm:items-center items-start">
              <a
                href="#quickstart"
                className="px-8 py-3.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-all shadow-sm flex items-center gap-2"
              >
                Follow Setup Steps <ArrowRight size={16} />
              </a>
              <Link
                href="/developers"
                className="px-8 py-3.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--sidebar-accent)] transition-all shadow-sm flex items-center gap-2"
              >
                Full Developer Hub
              </Link>
            </div>
          </div>

          {/* Right Protocol Status Card */}
          <aside
            className="bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] rounded-[2rem] p-8 shadow-xl interactive-luxury-card"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4 mb-6">
              <span className="flex items-center gap-2 text-sm font-semibold font-mono text-[var(--primary)]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                Live Network Parameters
              </span>
              <span className="text-xs font-mono text-[var(--muted-foreground)] uppercase tracking-wider bg-[var(--sidebar-accent)] px-2.5 py-1 rounded-full border border-[var(--border)]">v1.0-ready</span>
            </div>

            <div className="space-y-4 text-sm font-sans">
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Asset</span>
                <strong className="text-[var(--foreground)] font-mono text-sm">USDC (6 Decimals)</strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Target Rail</span>
                <strong className="text-[var(--foreground)] font-mono text-sm">Arc Testnet (Chain 5042002)</strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Buyer Flow</span>
                <strong className="text-[var(--foreground)]">Injected Wallet + Scan QR</strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--border)]/50">
                <span className="text-[var(--muted-foreground)]">Fulfillment Source</span>
                <strong className="text-[var(--primary)] font-semibold">Replay-Safe HMAC Webhook</strong>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center gap-2.5 text-sm text-[var(--muted-foreground)] font-medium">
              <ShieldCheck size={18} className="text-[var(--primary)] shrink-0" />
              <span>Zero seed phrase or private key requirements for sellers</span>
            </div>
          </aside>
        </div>
      </header>


      {/* 6-Step Setup Section */}
      <section className="max-w-7xl mx-auto px-6 py-24" id="quickstart">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
            Step-by-Step Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
            From "I have a website" to a verified payment
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
            Keep your store catalogue and database in your backend application while Druto owns the non-custodial crypto payment boundary.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <article className="bg-[var(--card)] p-7 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="mb-4">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-xs font-bold border border-[var(--primary)]/20 tracking-wider">01</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] font-sans mb-2.5 tracking-tight">Create Seller Identity</h3>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Choose a stable marketplace ID and seller ID. The ID stays constant even if the merchant display name changes.
              </p>
            </div>
            <a href="#credentials" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:gap-2.5 transition-all">
              Credential map <ChevronRight size={15} />
            </a>
          </article>

          <article className="bg-[var(--card)] p-7 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="mb-4">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-xs font-bold border border-[var(--primary)]/20 tracking-wider">02</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] font-sans mb-2.5 tracking-tight">Register Payment Destination</h3>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Submit the Arc EVM address used by the seller to receive direct USDC payments without intermediate custody.
              </p>
            </div>
            <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:gap-2.5 transition-all">
              Seller registry <ChevronRight size={15} />
            </Link>
          </article>

          <article className="bg-[var(--card)] p-7 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="mb-4">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-xs font-bold border border-[var(--primary)]/20 tracking-wider">03</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] font-sans mb-2.5 tracking-tight">Generate API Credentials</h3>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Create an API key and webhook secret in your workspace dashboard. Store both securely in your server environment variables.
              </p>
            </div>
            <a href="#credentials" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:gap-2.5 transition-all">
              Server secrets <ChevronRight size={15} />
            </a>
          </article>

          <article className="bg-[var(--card)] p-7 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="mb-4">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-xs font-bold border border-[var(--primary)]/20 tracking-wider">04</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] font-sans mb-2.5 tracking-tight">Add Backend Adapter</h3>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Install <code className="font-mono text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground)]">@druto/sdk</code> on your server and call <code className="font-mono text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground)]">create()</code> after recalculating your cart's trusted total.
              </p>
            </div>
            <a href="#backend" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:gap-2.5 transition-all">
              Backend adapter <ChevronRight size={15} />
            </a>
          </article>

          <article className="bg-[var(--card)] p-7 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="mb-4">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-xs font-bold border border-[var(--primary)]/20 tracking-wider">05</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] font-sans mb-2.5 tracking-tight">Hosted Checkout Flow</h3>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Return the secure checkout URL to the buyer. Buyer signs only the exact amount requested in their wallet.
              </p>
            </div>
            <a href="#backend" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:gap-2.5 transition-all">
              Hosted handoff <ChevronRight size={15} />
            </a>
          </article>

          <article className="bg-[var(--card)] p-7 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card flex flex-col justify-between hover:shadow-md transition-all">
            <div>
              <div className="mb-4">
                <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-xs font-bold border border-[var(--primary)]/20 tracking-wider">06</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] font-sans mb-2.5 tracking-tight">Fulfill from Signed Webhook</h3>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Verify the HMAC signature on <code className="font-mono text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground)]">payment.verified</code>, ensure idempotency against <code className="font-mono text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground)]">event.id</code>, and ship the order.
              </p>
            </div>
            <a href="#webhooks" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:gap-2.5 transition-all">
              Webhook handler <ChevronRight size={15} />
            </a>
          </article>
        </div>
      </section>

      {/* Credential Map Section */}
      <section className="bg-[var(--card)]/40 border-y border-[var(--border)] py-24 px-6" id="credentials">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-14">
            <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
              Server Boundary
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
              Two Secrets. One Payment Pipeline.
            </h2>
            <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
              Your API key authorizes your backend to generate Payment Intents. Your Webhook secret verifies events arriving back at your endpoint.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="bg-[var(--card)] p-8 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card hover:shadow-md transition-all">
              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0 border border-[var(--primary)]/20">
                  <KeyRound size={22} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-xl text-[var(--foreground)] tracking-tight">API Key</h3>
                  <span className="text-xs text-[var(--muted-foreground)] font-mono font-medium tracking-wide">Server-to-Server Auth</span>
                </div>
              </div>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Use this from your secure backend to create Payment Intents and inspect transaction status. Never include this in frontend browser code.
              </p>
              <div className="p-4 bg-[#142622] text-[#e1f0e9] border border-[#203a34] rounded-xl font-mono text-sm flex justify-between items-center shadow-inner">
                <span className="font-mono text-xs sm:text-sm">DRUTO_API_KEY=<strong>druto_sec_test_••••</strong></span>
                <span className="text-[11px] bg-[#224039] text-[#7ce0c3] px-2.5 py-1 rounded font-mono font-bold tracking-wider">ENV ONLY</span>
              </div>
            </div>

            <div className="bg-[var(--card)] p-8 rounded-2xl border border-[var(--border)] shadow-sm interactive-luxury-card hover:shadow-md transition-all">
              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0 border border-[var(--primary)]/20">
                  <Webhook size={22} />
                </div>
                <div>
                  <h3 className="font-sans font-bold text-xl text-[var(--foreground)] tracking-tight">Webhook Secret</h3>
                  <span className="text-xs text-[var(--muted-foreground)] font-mono font-medium tracking-wide">HMAC-SHA256 Verification</span>
                </div>
              </div>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mb-6 font-sans">
                Used by your backend webhook handler to verify the <code className="font-mono text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground)]">druto-signature</code> header against the raw body before fulfilling any order.
              </p>
              <div className="p-4 bg-[#142622] text-[#e1f0e9] border border-[#203a34] rounded-xl font-mono text-sm flex justify-between items-center shadow-inner">
                <span className="font-mono text-xs sm:text-sm">DRUTO_WEBHOOK_SECRET=<strong>whsec_••••••••</strong></span>
                <span className="text-[11px] bg-[#224039] text-[#7ce0c3] px-2.5 py-1 rounded font-mono font-bold tracking-wider">HMAC KEY</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Copy-Paste Backend Implementation */}
      <section className="max-w-7xl mx-auto px-6 py-24" id="backend">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-wider block mb-2">
            Copy-Paste Adapter
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-serif font-normal text-[var(--foreground)] mt-2 mb-4 tracking-tight leading-[1.2]">
            Smallest Useful Backend Adapter
          </h2>
          <p className="text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-sans max-w-2xl">
            Install the SDK and drop in this reference handler on your Node / Next.js / Express server.
          </p>
        </div>

        <div className="developer-code-grid">
          <div className="interactive-luxury-card">
            <CopyBlock code={installSnippet} language="bash" />
          </div>
          <div className="interactive-luxury-card">
            <CopyBlock code={serverSnippet} language="typescript" />
          </div>
        </div>

        <div className="mt-12">
          <div className="bg-[var(--card)] p-8 rounded-2xl border border-[var(--border)] shadow-sm">
            <h4 className="font-sans font-bold text-[var(--foreground)] text-lg mb-4 tracking-tight">
              Payment Request Parameters
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-sm text-[var(--muted-foreground)] font-sans">
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)]/60">
                <Check size={16} className="text-[var(--primary)] shrink-0" />
                <span><code className="text-[var(--foreground)] font-mono font-semibold text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)]">externalOrderId</code> — Store reference</span>
              </div>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)]/60">
                <Check size={16} className="text-[var(--primary)] shrink-0" />
                <span><code className="text-[var(--foreground)] font-mono font-semibold text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)]">idempotencyKey</code> — Safe retry key</span>
              </div>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)]/60">
                <Check size={16} className="text-[var(--primary)] shrink-0" />
                <span><code className="text-[var(--foreground)] font-mono font-semibold text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)]">amount</code> — USDC unit amount</span>
              </div>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)]/60">
                <Check size={16} className="text-[var(--primary)] shrink-0" />
                <span><code className="text-[var(--foreground)] font-mono font-semibold text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)]">seller</code> — Destination</span>
              </div>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)]/60">
                <Check size={16} className="text-[var(--primary)] shrink-0" />
                <span><code className="text-[var(--foreground)] font-mono font-semibold text-xs bg-[var(--sidebar-accent)] px-1.5 py-0.5 rounded border border-[var(--border)]">returnUrl</code> — Post-checkout redirect</span>
              </div>
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--background)] border border-[var(--border)]/60">
                <ShieldCheck size={16} className="text-[var(--primary)] shrink-0" />
                <span><strong className="text-[var(--foreground)] font-semibold">Cryptographic</strong> Intent Verification</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action Box */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="bg-[#1c302c] text-[#e1f0e9] rounded-[2.5rem] p-10 md:p-16 relative overflow-hidden shadow-2xl border border-[#2d4a46]">
          <div className="absolute right-0 top-0 w-96 h-96 bg-[var(--accent)]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl">
            <span className="text-xs font-mono font-semibold text-[var(--accent)] uppercase tracking-wider block mb-3">
              Ready for the first test payment?
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-normal mb-5 leading-tight text-white tracking-tight">
              Register your seller, then open your first Druto checkout.
            </h2>
            <p className="text-[#a5cec0] text-base sm:text-lg leading-relaxed mb-8 font-sans">
              Start on Arc Testnet with test USDC and a disposable developer wallet. Keep your production funds safe.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/dashboard"
                className="px-8 py-4 rounded-full bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold transition-all shadow-lg flex items-center justify-center gap-2 border border-[#3b635e]"
              >
                Open Workspace Dashboard <ArrowRight size={16} />
              </Link>
              <a
                href={starterZipUrl}
                download
                className="px-8 py-4 rounded-full bg-[#12201d] hover:bg-[#1a2d29] text-[#e1f0e9] text-sm font-medium transition-all flex items-center justify-center gap-2 border border-[#2a4740]"
              >
                <Download size={16} /> Download Next.js Starter
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Modern Themed Site Footer */}
      <SiteFooter />
    </div>
  );
}
