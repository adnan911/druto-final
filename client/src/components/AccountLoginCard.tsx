import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Wallet,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { toast } from "sonner";

export default function AccountLoginCard() {
  const [email, setEmail] = useState("");
  const [isWalletSigning, setIsWalletSigning] = useState(false);
  const auraCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const directLogin = trpc.auth.directAccountLogin.useMutation();
  const privyAccountLogin = trpc.auth.privyLogin.useMutation();
  const createChallenge = trpc.auth.createWalletChallenge.useMutation();
  const verifyWallet = trpc.auth.verifyWalletLogin.useMutation();
  const utils = trpc.useUtils();

  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();

  let privy: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    privy = usePrivy();
  } catch {
    privy = null;
  }

  // Dynamic Aura Wave Animation
  useEffect(() => {
    const canvas = auraCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);
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

  const handleWalletSignIn = async () => {
    try {
      setIsWalletSigning(true);
      let activeAddress = address;

      if (!isConnected || !activeAddress) {
        const injectedConnector = connectors.find(
          (c) => c.id === "injected" || c.name.toLowerCase().includes("metamask")
        ) || connectors[0];

        if (injectedConnector) {
          const connectResult = await connectAsync({ connector: injectedConnector });
          activeAddress = connectResult.accounts[0];
        } else {
          toast.error("No compatible EVM wallet detected");
          setIsWalletSigning(false);
          return;
        }
      }

      if (!activeAddress) {
        toast.error("Could not retrieve wallet address");
        setIsWalletSigning(false);
        return;
      }

      const { challengeId, message } = await createChallenge.mutateAsync({
        walletAddress: activeAddress,
      });

      const signature = await signMessageAsync({ message });

      await verifyWallet.mutateAsync({
        challengeId,
        walletAddress: activeAddress,
        signature,
      });

      toast.success("Wallet session verified");
      await utils.auth.me.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Wallet sign-in cancelled or failed");
    } finally {
      setIsWalletSigning(false);
    }
  };

  const handlePrivySignIn = async () => {
    if (!privy) {
      toast.error("Privy authentication not initialized");
      return;
    }

    try {
      if (!privy.authenticated) {
        await privy.login();
      }

      const privyUser = privy.user;
      if (!privyUser) return;

      const accessToken = await privy.getAccessToken();
      if (!accessToken) {
        toast.error("Could not obtain Privy access token");
        return;
      }

      const privyEmail = privyUser.email?.address || privyUser.google?.email;
      const privyWallet = privyUser.wallet?.address;

      await privyAccountLogin.mutateAsync({
        accessToken,
        email: privyEmail,
        name: privyEmail ? privyEmail.split("@")[0] : undefined,
        walletAddress: privyWallet,
      });

      toast.success("Privy account linked");
      await utils.auth.me.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Privy login failed");
    }
  };

  const handleDirectSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid operator email");
      return;
    }

    try {
      await directLogin.mutateAsync({
        email: email.trim().toLowerCase(),
        name: email.split("@")[0],
      });
      toast.success("Signed in to operator workspace");
      await utils.auth.me.invalidate();
    } catch (err: any) {
      toast.error(err?.message || "Sign in failed");
    }
  };

  const isPending =
    directLogin.isPending ||
    privyAccountLogin.isPending ||
    isWalletSigning ||
    createChallenge.isPending ||
    verifyWallet.isPending;

  return (
    <div className="min-h-screen w-full relative bg-[var(--background)] font-sans antialiased text-[var(--foreground)] flex flex-col justify-between overflow-x-hidden">
      <canvas ref={auraCanvasRef} className="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-60" />

      {/* Top Navbar */}
      <header className="relative z-20 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center group transition-transform duration-300 active:scale-95">
          <img src="/druto_logo_full.png" alt="Druto" className="h-16 md:h-[72px] w-auto object-contain -translate-y-1.5" />
        </Link>
        <div className="flex items-center gap-5">
          <Link href="/developers" className="text-xs font-mono font-medium text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors hidden sm:block">
            Developer Docs
          </Link>
          <span className="px-3 py-1 rounded-full bg-[var(--card)] border border-[var(--border)] text-[11px] font-mono font-medium text-[var(--primary)] shadow-sm">
            Arc Testnet (5042002)
          </span>
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="relative z-10 max-w-6xl mx-auto w-full px-6 py-12 grid lg:grid-cols-12 gap-12 items-center">
        {/* Left Copy & Protocol Narrative */}
        <section className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs text-[var(--primary)] bg-[var(--card)] border border-[var(--border)] shadow-sm backdrop-blur-md">
            <Sparkles size={14} className="text-[var(--primary)]" />
            <span className="font-medium tracking-wide uppercase font-mono">Merchant & Operator Workspace</span>
          </div>

          <h1 className="text-5xl lg:text-6xl font-light text-[var(--foreground)] font-serif tracking-tight leading-[1.12]">
            Operate your stablecoin <br />
            <span className="italic text-[var(--primary)] font-serif">flow from one ledger</span>
          </h1>

          <p className="text-base sm:text-lg text-[var(--muted-foreground)] max-w-xl font-normal font-sans leading-relaxed">
            Manage payment intents, track cryptographic Arc Testnet settlements in real-time, register seller identities, and inspect signed webhooks.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 max-w-lg">
            <div className="bg-[var(--card)]/90 backdrop-blur-md p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-start gap-3">
              <ShieldCheck size={20} className="text-[var(--primary)] shrink-0 mt-0.5" />
              <div>
                <strong className="text-xs font-semibold text-[var(--foreground)] block font-sans">EIP-712 Signature Auth</strong>
                <span className="text-[11px] text-[var(--muted-foreground)] leading-tight block mt-0.5 font-sans">Non-custodial login. Your private keys never leave your device.</span>
              </div>
            </div>

            <div className="bg-[var(--card)]/90 backdrop-blur-md p-4 rounded-2xl border border-[var(--border)] shadow-sm flex items-start gap-3">
              <KeyRound size={20} className="text-[var(--primary)] shrink-0 mt-0.5" />
              <div>
                <strong className="text-xs font-semibold text-[var(--foreground)] block font-sans">Immediate Credentials</strong>
                <span className="text-[11px] text-[var(--muted-foreground)] leading-tight block mt-0.5 font-sans">Provision server API keys and HMAC secrets instantaneously.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Authentication Card */}
        <section className="lg:col-span-5">
          <div
            className="bg-[var(--card)]/95 backdrop-blur-2xl border border-[var(--border)] rounded-[2.2rem] p-8 sm:p-10 shadow-2xl interactive-luxury-card relative"
          >
            <div className="mb-6">
              <span className="text-xs font-mono font-semibold text-[var(--primary)] uppercase tracking-widest block mb-1">
                Authentication
              </span>
              <h2 className="text-2xl font-serif font-light text-[var(--foreground)]">Sign in to Druto</h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed font-sans">
                Connect your EVM wallet or use direct operator credentials.
              </p>
            </div>

            {/* Wallet Primary Action */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleWalletSignIn}
                disabled={isPending}
                className="w-full py-3.5 px-5 rounded-full bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] text-sm font-medium transition-all shadow-sm flex items-center justify-center gap-2.5 disabled:opacity-60"
              >
                {isWalletSigning ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Signing Challenge...</span>
                  </>
                ) : (
                  <>
                    <Wallet size={16} />
                    <span>{address ? `Sign in (${address.slice(0, 6)}…${address.slice(-4)})` : "Sign in with EVM Wallet"}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              {privy && (
                <button
                  type="button"
                  onClick={handlePrivySignIn}
                  disabled={!privy.ready || isPending}
                  className="w-full py-3 px-5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-xs font-medium hover:bg-[var(--sidebar-accent)] transition-all flex items-center justify-center gap-2"
                >
                  <UserCheck size={14} className="text-[var(--muted-foreground)]" />
                  <span>Sign in with Privy (Email / Social)</span>
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="relative text-center my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <span className="relative bg-[var(--card)] px-3 text-[11px] font-mono uppercase text-[var(--muted-foreground)]">
                or email access
              </span>
            </div>

            {/* Email Direct Operator Form */}
            <form onSubmit={handleDirectSignIn} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5 font-sans">
                  Operator Email Address
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <input
                    type="email"
                    placeholder="merchant@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-all bg-[var(--background)] font-sans"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--sidebar-accent)] hover:bg-[var(--sidebar-accent)]/80 text-[var(--foreground)] text-xs font-medium transition-all flex items-center justify-center gap-2"
              >
                <span>{email ? "Continue with Email" : "Direct Operator Sign-in"}</span>
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-sans">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>Zero seed phrase requested</span>
              </div>
              <Link href="/developers" className="hover:text-[var(--primary)] transition-colors flex items-center gap-1 font-mono">
                API Docs <ExternalLink size={10} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 border-t border-[var(--border)] text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-[var(--muted-foreground)] font-sans">
        <div>© {new Date().getFullYear()} Druto Platform. Built for Arc Testnet USDC Payments.</div>
        <div className="flex gap-6">
          <Link href="/" className="hover:text-[var(--primary)] transition-colors">Home</Link>
          <Link href="/developers" className="hover:text-[var(--primary)] transition-colors">Developer Hub</Link>
          <Link href="/developers/start" className="hover:text-[var(--primary)] transition-colors">Quickstart</Link>
        </div>
      </footer>
    </div>
  );
}
