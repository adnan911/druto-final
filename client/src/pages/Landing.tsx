import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import SiteFooter from "@/components/SiteFooter";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Flame,
  GitBranch,
  Globe,
  KeyRound,
  Layers,
  Layers3,
  LockKeyhole,
  Menu,
  Network,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wallet,
  WalletCards,
  Webhook,
  X,
  Zap,
} from "lucide-react";

declare global {
  interface Window {
    THREE?: any;
    Matter?: any;
    Chart?: any;
  }
}

const logo = "/DRUTO_D_logo.png";

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [machineActive, setMachineActive] = useState(true);
  const [activeFlowStep, setActiveFlowStep] = useState<number>(1);

  // Automatic Flow Step Progression
  useEffect(() => {
    if (!machineActive) return;
    const interval = setInterval(() => {
      setActiveFlowStep((prev) => (prev >= 4 ? 1 : prev + 1));
    }, 2500);
    return () => clearInterval(interval);
  }, [machineActive]);

  // References for Canvas & Interactive Widgets
  const auraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const networkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRingRef = useRef<SVGCircleElement | null>(null);
  const progressDotRef = useRef<SVGCircleElement | null>(null);

  // 1. Hero Aura Canvas Background Animation
  useEffect(() => {
    const canvas = auraCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 800);
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
      time += 0.0012; // Slow relaxed transition
      ctx.fillStyle = "#fdfdfb";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "multiply";

      const numFolds = 16;
      for (let i = 0; i < numFolds; i++) {
        const normalizedX = i / numFolds;
        const xPos = normalizedX * width + Math.sin(time * 1.5 + i) * (width * 0.12);
        const foldWidth = (width / numFolds) * 4.5;
        const waveIntensity = (Math.sin(time * 1.8 + i * 0.4) + 1) * 0.5;

        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, `rgba(253, 253, 251, 0)`);
        grad.addColorStop(0.35, `rgba(45, 74, 70, ${waveIntensity * 0.12})`);
        grad.addColorStop(0.7, `rgba(168, 144, 120, ${waveIntensity * 0.16})`);
        grad.addColorStop(1, `rgba(249, 212, 159, ${waveIntensity * 0.14})`);

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

  // 2. Starlight Chart in Hero
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || typeof window.Chart === "undefined") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, "rgba(45, 74, 70, 0.25)");
    gradient.addColorStop(1, "rgba(45, 74, 70, 0.0)");

    const chartInstance = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: ["1", "2", "3", "4", "5", "6", "7"],
        datasets: [
          {
            data: [4200, 5800, 5100, 8400, 7900, 10500, 12450],
            borderColor: "#2d4a46",
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            fill: true,
            backgroundColor: gradient,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1200 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false, min: 3000 },
        },
      },
    });

    return () => chartInstance.destroy();
  }, []);



  // 5. Network Particles Canvas Animation
  useEffect(() => {
    const canvas = networkCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = canvas.clientWidth);
    let height = (canvas.height = canvas.clientHeight);

    class Particle {
      originX: number = 0;
      originY: number = 0;
      angle: number = 0;
      speed: number = 0;
      distance: number = 0;
      maxLength: number = 0;
      length: number = 0;
      alpha: number = 0;
      lineWidth: number = 0;
      waveOffset: number = 0;

      constructor() {
        this.reset(true);
      }

      reset(initial = false) {
        this.originX = width / 2 + (Math.random() - 0.5) * (width * 0.3);
        this.originY = height + 60;
        this.angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        this.speed = 0.5 + Math.random() * 1.6;
        this.distance = initial ? Math.random() * (height * 1.1) : Math.random() * 40;
        this.maxLength = 30 + Math.random() * 140;
        this.length = 0;
        this.alpha = 0;
        this.lineWidth = 0.6 + Math.random() * 1.4;
        this.waveOffset = Math.random() * Math.PI * 2;
      }

      update(time: number) {
        this.distance += this.speed;
        this.length = Math.min(this.maxLength, this.distance * 0.9);
        const normalized = this.distance / (height * 1.15);
        this.alpha = Math.min(1, this.distance / 100) * Math.max(0, 1 - normalized * 0.88);
        if (this.distance > height * 1.25) this.reset();
      }

      draw() {
        if (!ctx) return;
        const startX = this.originX + Math.cos(this.angle) * this.distance;
        const startY = this.originY + Math.sin(this.angle) * this.distance;
        const endX = this.originX + Math.cos(this.angle) * (this.distance + this.length);
        const endY = this.originY + Math.sin(this.angle) * (this.distance + this.length);

        const grad = ctx.createLinearGradient(startX, startY, endX, endY);
        grad.addColorStop(0, `rgba(45, 74, 70, 0)`);
        grad.addColorStop(1, `rgba(45, 74, 70, ${this.alpha * 0.75})`);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = this.lineWidth;
        ctx.stroke();
      }
    }

    const particles: Particle[] = Array.from({ length: 90 }, () => new Particle());
    let animId: number;

    function animateParticles(t = 0) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.update(t);
        p.draw();
      });
      animId = requestAnimationFrame(animateParticles);
    }
    animateParticles();

    return () => cancelAnimationFrame(animId);
  }, []);





  return (
    <div className="antialiased selection:bg-[var(--accent)] selection:text-[var(--primary)] overflow-x-hidden text-[var(--foreground)] bg-[var(--background)] font-sans">
      {/* Navigation */}
      <nav id="site-nav" className="fixed w-full z-50 border-b border-[var(--border)] top-0 right-0 left-0 bg-[var(--background)]/90 backdrop-blur-2xl transition-all duration-300">
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
            <div className="flex gap-3 sm:gap-5 items-center ml-auto z-20 font-sans">
              <Link
                href="/dashboard"
                className="group inline-flex items-center justify-center gap-2 transition-all duration-300 hover:opacity-90 sm:px-6 text-sm font-medium text-[var(--primary-foreground)] bg-[var(--primary)] h-11 rounded-full pr-5 pl-5 shadow-sm"
              >
                <span className="hidden sm:inline">Launch App</span>
                <span className="sm:hidden">Launch</span>
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
              <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-xl shadow-lg p-3 flex flex-col gap-1 font-sans">
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Infrastructure
                </a>
                <a href="#machine" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Lifecycle
                </a>
                <Link href="/developers" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Developers Hub
                </Link>
                <Link href="/developers/start" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] rounded-2xl transition-colors">
                  Start Guide
                </Link>
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="px-4 py-3 text-sm font-medium text-[var(--primary)] hover:bg-[var(--accent)] rounded-2xl transition-colors">
                  Merchant Workspace
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative overflow-hidden bg-[var(--background)] pt-32 pb-20 sm:pt-36 sm:pb-28 lg:pt-40 lg:pb-32 border-b border-[var(--border)]">
        <canvas ref={auraCanvasRef} className="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-60" />

        <div className="max-w-7xl z-10 mx-auto px-6 sm:px-8 lg:px-12 relative">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-6 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6 text-xs text-[var(--primary)] bg-[var(--card)] border border-[var(--border)] shadow-xs backdrop-blur-md font-sans font-medium tracking-wide uppercase">
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-ping" />
                <span>Arc Testnet</span>
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl leading-[1.08] font-light text-[var(--foreground)] tracking-tighter font-serif mb-6">
                Non-Custodial <br />
                <span className="italic text-[var(--primary)] font-serif">stablecoin payments</span>
              </h1>

              <p className="text-base sm:text-lg lg:text-xl text-[var(--muted-foreground)] mb-8 leading-relaxed max-w-xl font-normal font-sans">
                Druto empowers marketplaces and commerce platforms with server-signed payment intents, instant checkout, and cryptographic Arc finality.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 sm:items-center items-start font-sans">
                <Link href="/dashboard" className="group outline-none cursor-pointer transition-transform duration-200 active:scale-95 bg-transparent border-0 p-0 relative">
                  <div className="relative z-10 flex items-center justify-center rounded-full">
                    <div
                      className="flex overflow-hidden transition-all duration-300 rounded-full h-12 px-8 items-center justify-center bg-[var(--primary)] hover:opacity-95 shadow-sm"
                    >
                      <span className="text-[var(--primary-foreground)] text-sm font-medium tracking-wide uppercase relative z-20">
                        Open Dashboard
                      </span>
                    </div>
                  </div>
                </Link>

                <Link
                  href="/developers"
                  className="relative group outline-none cursor-pointer h-12 px-7 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-sm font-medium tracking-wide hover:bg-[var(--sidebar-accent)] transition-all duration-300 flex items-center gap-2 shadow-xs hover:shadow active:scale-95"
                >
                  Developer Hub
                  <ChevronRight size={16} className="text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] group-hover:translate-x-1 transition-all" />
                </Link>
              </div>
            </div>

            {/* Right Dashboard Mockup */}
            <div className="lg:col-span-6 z-10 w-full relative font-sans flex items-center justify-center lg:justify-end">
              <div className="relative w-full max-w-[620px] h-[480px] sm:h-[520px]">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[var(--primary)]/15 via-[var(--secondary)]/15 to-[var(--accent)]/15 blur-3xl rounded-full z-0 pointer-events-none -translate-x-6 translate-y-6" />

                {/* Main Dashboard Window */}
                <div
                  className="flex flex-col overflow-hidden z-10 transition-all duration-700 ease-out hover:shadow-2xl bg-[var(--card)] w-full h-full border-[var(--border)] border rounded-3xl absolute inset-0 backdrop-blur-md"
                  style={{
                    boxShadow: "0 30px 60px -15px rgba(45,74,70,0.12), 0 10px 24px -10px rgba(168,144,120,0.08), inset 0 2px 4px rgba(255,255,255,0.8)",
                  }}
                >
                  {/* Browser Header */}
                  <div className="h-11 bg-[var(--background)]/80 border-b border-[var(--border)] flex items-center px-4 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="flex gap-1.5 w-16 pl-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--muted)] border border-[var(--border)]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--muted)] border border-[var(--border)]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--muted)] border border-[var(--border)]" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg py-0.5 px-3 flex items-center gap-2 max-w-[260px] w-full justify-center">
                        <LockKeyhole size={11} className="text-[var(--muted-foreground)]" />
                        <span className="text-[11px] text-[var(--muted-foreground)] font-mono tracking-wide truncate">druto</span>
                      </div>
                    </div>
                    <div className="w-16" />
                  </div>

                  {/* Main View */}
                  <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between overflow-hidden">
                    <div>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-[var(--primary)] shadow-[0_0_10px_rgba(45,74,70,0.4)]" />
                            <span className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium font-mono">Verified Rail</span>
                          </div>
                          <h2 className="text-xl sm:text-2xl font-light text-[var(--foreground)] tracking-tight font-serif">
                            Settlement Overview
                          </h2>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-medium font-mono mb-0.5">Arc Native Volume</p>
                          <p className="text-lg sm:text-xl font-light tracking-tight text-[var(--foreground)] font-serif">$84,250.00 <small className="text-[10px] font-mono text-[var(--muted-foreground)]">USDC</small></p>
                        </div>
                      </div>

                      {/* Top Metric Strip */}
                      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-4">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 shadow-xs">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-mono mb-0.5">Finality Speed</p>
                          <p className="text-sm font-semibold text-[var(--foreground)] font-mono tracking-tight">&lt; 850ms</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 shadow-xs">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-mono mb-0.5">Custody Model</p>
                          <p className="text-sm font-semibold text-[var(--primary)] font-mono tracking-tight">0% Non-Custodial</p>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 shadow-xs">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-mono mb-0.5">Settlement Chain</p>
                          <p className="text-sm font-semibold text-[var(--foreground)] font-mono tracking-tight">Arc Testnet</p>
                        </div>
                      </div>

                      {/* Merchant Rows */}
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden shadow-xs font-sans">
                        <div className="grid grid-cols-12 gap-2 px-3.5 py-2 text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] bg-[var(--card)] font-mono">
                          <div className="col-span-5">Merchant Store</div>
                          <div className="col-span-3">Network Intent</div>
                          <div className="col-span-2 text-right">Settled</div>
                          <div className="col-span-2 text-right">Status</div>
                        </div>

                        <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 items-center border-b border-[var(--border)] hover:bg-[var(--card)] transition-colors">
                          <div className="col-span-5 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[var(--accent)]/30 border border-[var(--accent)] flex items-center justify-center text-[var(--primary)] font-bold text-[10px] font-mono shrink-0">
                              ST
                            </div>
                            <div className="min-w-0">
                              <p className="text-[var(--foreground)] text-xs font-medium truncate">Starlight Studio</p>
                              <p className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">0x82f...41e9</p>
                            </div>
                          </div>
                          <div className="col-span-3 text-[var(--muted-foreground)] text-[10px] font-mono truncate">DR-1842-ARC</div>
                          <div className="col-span-2 text-right text-[var(--foreground)] text-xs font-semibold font-mono">$12,450</div>
                          <div className="col-span-2 text-right">
                            <span className="text-[9px] font-medium text-[var(--primary)] bg-[var(--card)] px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">
                              VERIFIED
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 items-center hover:bg-[var(--card)] transition-colors">
                          <div className="col-span-5 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[var(--secondary)]/20 border border-[var(--secondary)]/40 flex items-center justify-center text-[var(--primary)] font-bold text-[10px] font-mono shrink-0">
                              LC
                            </div>
                            <div className="min-w-0">
                              <p className="text-[var(--foreground)] text-xs font-medium truncate">Lunar Cafe</p>
                              <p className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">0x3b1...7f02</p>
                            </div>
                          </div>
                          <div className="col-span-3 text-[var(--muted-foreground)] text-[10px] font-mono truncate">DR-9281-ARC</div>
                          <div className="col-span-2 text-right text-[var(--foreground)] text-xs font-semibold font-mono">$4,820</div>
                          <div className="col-span-2 text-right">
                            <span className="text-[9px] font-medium text-[var(--primary)] bg-[var(--card)] px-1.5 py-0.5 rounded border border-[var(--border)] font-mono">
                              VERIFIED
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Receipt Card */}
                <div
                  className="hidden sm:block bg-[var(--card)] w-[260px] z-20 border-[var(--border)] border rounded-2xl p-4 absolute -bottom-6 -left-6 shadow-2xl animate-luxury-float font-sans"
                  style={{
                    boxShadow: "0 24px 48px -12px rgba(45,74,70,0.18), 0 8px 16px -8px rgba(15,23,42,0.08), inset 0 2px 2px rgba(255,255,255,1)",
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-xs font-medium tracking-tight text-[var(--foreground)]">Payment Receipt</h3>
                      <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-mono">ArcScan Confirmed</p>
                    </div>
                    <div className="w-5 h-5 rounded-full bg-[var(--background)] flex items-center justify-center text-[var(--primary)] border border-[var(--border)]">
                      <Check size={10} strokeWidth={3} />
                    </div>
                  </div>

                  <div className="mb-2">
                    <p className="text-xl font-light tracking-tight text-[var(--foreground)] font-serif leading-none">$12,450.00 <small className="text-[10px] font-mono text-[var(--muted-foreground)]">USDC</small></p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] font-medium text-[var(--primary)] bg-[var(--background)] px-1.5 py-0.5 rounded border border-[var(--border)] flex items-center gap-1 font-mono">
                        <Zap size={10} /> Instant Finality
                      </span>
                    </div>
                  </div>

                  <div className="relative h-10 w-full mb-2">
                    <canvas ref={chartCanvasRef} />
                  </div>

                  <div className="space-y-1.5 text-[11px] border-t border-[var(--border)] pt-2 font-sans">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--muted-foreground)]">TX</span>
                      <span className="font-mono text-[var(--foreground)] font-medium">0x7f0a...3b21</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--muted-foreground)]">Asset</span>
                      <span className="font-medium text-[var(--foreground)]">Arc USDC</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Interactive Lifecycle Circuit Machine Section */}
      <section id="machine" className="overflow-hidden sm:py-32 sm:px-8 text-[var(--foreground)] pt-24 pr-4 pb-24 pl-4 relative bg-[var(--background)] border-t border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="max-w-3xl mb-16 text-center mx-auto">
            <h2 className="text-4xl lg:text-5xl font-light tracking-tight text-[var(--foreground)] mb-4 font-serif">
              A deterministic path to <span className="italic text-[var(--primary)] font-serif">finality</span>
            </h2>

            <p className="text-base sm:text-lg text-[var(--muted-foreground)] font-normal leading-relaxed max-w-2xl mx-auto font-sans">
              Druto guarantees zero client-side price tampering and zero private-key exposure through an auditable 4-phase transaction lifecycle.
            </p>
          </div>

          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left Sleek 3D Cards & Narrative */}
            <div className="lg:col-span-6 space-y-6">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[var(--card)] border border-[var(--border)] shadow-[0_4px_16px_-4px_rgba(45,74,70,0.12)]">
                  <Layers3 size={20} className="text-[var(--primary)]" />
                </div>
                <div>
                  <span className="font-semibold text-lg sm:text-xl text-[var(--foreground)] font-sans block">
                    Server-Signed Payment Intents
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)] font-mono">
                    Phase {activeFlowStep} of 4: {activeFlowStep === 1 ? "Payload Creation" : activeFlowStep === 2 ? "Buyer Signature" : activeFlowStep === 3 ? "Arc Finality Verification" : "Webhook Fulfillment"}
                  </span>
                </div>
              </div>

              <p className="text-sm sm:text-base text-[var(--muted-foreground)] font-normal leading-relaxed font-sans">
                The merchant backend generates an immutable intent containing the exact atomic units, idempotency key, seller wallet, and order context. The browser only renders the verified checkout.
              </p>

              {/* 4 Sleek 3D Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                {/* Card 1 */}
                <button
                  type="button"
                  onClick={() => setActiveFlowStep(1)}
                  className={`text-left p-4 rounded-2xl sleek-3d-card flex flex-col justify-between transition-all ${
                    activeFlowStep === 1 ? "active-step" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                      <KeyRound size={15} />
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[var(--primary)]">01</span>
                  </div>
                  <div>
                    <strong className="text-xs font-semibold text-[var(--foreground)] block font-sans mb-1">
                      Idempotent Keys
                    </strong>
                    <span className="text-[11px] text-[var(--muted-foreground)] leading-relaxed block font-sans">
                      Deterministic SHA-256 keys prevent double charges on network retries.
                    </span>
                  </div>
                </button>

                {/* Card 2 */}
                <button
                  type="button"
                  onClick={() => setActiveFlowStep(2)}
                  className={`text-left p-4 rounded-2xl sleek-3d-card flex flex-col justify-between transition-all ${
                    activeFlowStep === 2 ? "active-step" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                      <GitBranch size={15} />
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[var(--primary)]">02</span>
                  </div>
                  <div>
                    <strong className="text-xs font-semibold text-[var(--foreground)] block font-sans mb-1">
                      Multi-Seller Splits
                    </strong>
                    <span className="text-[11px] text-[var(--muted-foreground)] leading-relaxed block font-sans">
                      Direct atomic settlement routes funds to multiple merchant wallets.
                    </span>
                  </div>
                </button>

                {/* Card 3 */}
                <button
                  type="button"
                  onClick={() => setActiveFlowStep(3)}
                  className={`text-left p-4 rounded-2xl sleek-3d-card flex flex-col justify-between transition-all ${
                    activeFlowStep === 3 ? "active-step" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                      <ShieldCheck size={15} />
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[var(--primary)]">03</span>
                  </div>
                  <div>
                    <strong className="text-xs font-semibold text-[var(--foreground)] block font-sans mb-1">
                      Arc Finality Proof
                    </strong>
                    <span className="text-[11px] text-[var(--muted-foreground)] leading-relaxed block font-sans">
                      Instant on-chain verification confirmed under 400ms on Arc Testnet.
                    </span>
                  </div>
                </button>

                {/* Card 4 */}
                <button
                  type="button"
                  onClick={() => setActiveFlowStep(4)}
                  className={`text-left p-4 rounded-2xl sleek-3d-card flex flex-col justify-between transition-all ${
                    activeFlowStep === 4 ? "active-step" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] shadow-sm">
                      <Webhook size={15} />
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[var(--primary)]">04</span>
                  </div>
                  <div>
                    <strong className="text-xs font-semibold text-[var(--foreground)] block font-sans mb-1">
                      Signed Webhooks
                    </strong>
                    <span className="text-[11px] text-[var(--muted-foreground)] leading-relaxed block font-sans">
                      HMAC-SHA256 authenticated events with 300s replay tolerance.
                    </span>
                  </div>
                </button>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 flex items-center">
                <Link
                  href="/developers"
                  className="h-11 px-7 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium tracking-wide inline-flex items-center gap-2 hover:opacity-90 transition-all shadow-md font-sans"
                >
                  <span>Explore Intent Contract</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>

            {/* Right Interactive Animated Flow Widget */}
            <div className="lg:col-span-6 flex flex-col items-center">
              <div
                className="w-full max-w-[480px] bg-[var(--card)]/90 backdrop-blur-xl border border-[var(--border)] rounded-[2.2rem] p-4 relative shadow-[0_20px_50px_-15px_rgba(45,74,70,0.12)] interactive-luxury-card overflow-hidden"
              >
                {/* Soft ambient inner aura */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-[var(--primary)]/8 blur-3xl pointer-events-none" />
                <div className="absolute top-1/4 right-10 w-40 h-40 rounded-full bg-[var(--accent)]/15 blur-2xl pointer-events-none" />

                {/* Subbar Header with Flow State Controls */}
                <div className="flex items-center justify-between px-4 py-2.5 mb-2 bg-[var(--background)]/80 backdrop-blur-md rounded-2xl border border-[var(--border)] text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-semibold text-[var(--foreground)]">Druto workflow</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMachineActive(!machineActive)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-[11px] hover:bg-[var(--sidebar-accent)] transition-colors flex items-center gap-1.5"
                    >
                      {machineActive ? <Pause size={11} className="text-[var(--primary)]" /> : <Play size={11} className="text-emerald-600" />}
                      <span>{machineActive ? "Auto-Flowing" : "Paused"}</span>
                    </button>
                  </div>
                </div>

                {/* Circuit Machine Canvas Area */}
                <div className="bg-[var(--background)] w-full h-[540px] rounded-[1.8rem] relative border border-[var(--border)] overflow-hidden shadow-inner">
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 440 540">
                    <defs>
                      <linearGradient id="flowGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2d4a46" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#f9d49f" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#2d4a46" stopOpacity="0.8" />
                      </linearGradient>
                      <linearGradient id="flowGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#2d4a46" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#1e9b83" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#2d4a46" stopOpacity="0.8" />
                      </linearGradient>
                      <linearGradient id="flowGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#1e9b83" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#f9d49f" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#2d4a46" stopOpacity="0.8" />
                      </linearGradient>

                      <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* Circuit Connections */}
                    {/* Path 1: 1 -> 2 */}
                    <path
                      d="M 192 115 L 220 115 L 220 195 L 248 195"
                      fill="none"
                      stroke="#2d4a46"
                      strokeWidth="2.5"
                      strokeOpacity="0.2"
                    />
                    <path
                      d="M 192 115 L 220 115 L 220 195 L 248 195"
                      fill="none"
                      stroke="url(#flowGrad1)"
                      strokeWidth="3.5"
                      strokeDasharray="8 8"
                      className={activeFlowStep === 1 ? "flow-anim-active" : ""}
                      filter="url(#glowFilter)"
                    />

                    {/* Path 2: 2 -> 3 */}
                    <path
                      d="M 332 250 L 332 300 L 220 300 L 220 325 L 192 325"
                      fill="none"
                      stroke="#2d4a46"
                      strokeWidth="2.5"
                      strokeOpacity="0.2"
                    />
                    <path
                      d="M 332 250 L 332 300 L 220 300 L 220 325 L 192 325"
                      fill="none"
                      stroke="url(#flowGrad2)"
                      strokeWidth="3.5"
                      strokeDasharray="8 8"
                      className={activeFlowStep === 2 ? "flow-anim-active" : ""}
                      filter="url(#glowFilter)"
                    />

                    {/* Path 3: 3 -> 4 */}
                    <path
                      d="M 192 355 L 220 355 L 220 450 L 248 450"
                      fill="none"
                      stroke="#2d4a46"
                      strokeWidth="2.5"
                      strokeOpacity="0.2"
                    />
                    <path
                      d="M 192 355 L 220 355 L 220 450 L 248 450"
                      fill="none"
                      stroke="url(#flowGrad3)"
                      strokeWidth="3.5"
                      strokeDasharray="8 8"
                      className={activeFlowStep === 3 ? "flow-anim-active" : ""}
                      filter="url(#glowFilter)"
                    />

                    {/* Interactive 4 Circuit Nodes Embedded Directly in SVG */}
                    {/* Node 1: Intent Creation */}
                    <foreignObject x="24" y="60" width="168" height="110">
                      <div
                        onClick={() => setActiveFlowStep(1)}
                        className={`w-full h-full rounded-2xl border p-3 font-mono cursor-pointer transition-all duration-500 flex flex-col justify-between sleek-3d-card ${
                          activeFlowStep === 1
                            ? "active-step border-[var(--primary)] ring-2 ring-[var(--primary)]/40 flow-node-active"
                            : "border-[var(--border)] bg-[var(--card)]/90 opacity-90 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] uppercase font-bold tracking-wider ${activeFlowStep === 1 ? "text-[var(--primary)]" : "text-[var(--primary)]"}`}>
                            1. Intent Created
                          </span>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${activeFlowStep === 1 ? "bg-white text-[var(--primary)] border-[var(--primary)]/30 shadow-sm" : "bg-[var(--background)] text-[var(--primary)] border-[var(--border)]"}`}>
                            <KeyRound size={12} />
                          </div>
                        </div>
                        <div className={`text-[10px] leading-tight p-1.5 rounded-lg border transition-colors ${activeFlowStep === 1 ? "bg-white/80 border-[var(--primary)]/20 text-[#2d4a46]" : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]/60"}`}>
                          <div className="flex justify-between text-[9px]">
                            <span>Amount:</span>
                            <span className="text-[var(--foreground)] font-semibold">$45.00 USDC</span>
                          </div>
                          <div className="flex justify-between mt-0.5 text-[9px]">
                            <span>Idempotency:</span>
                            <span className="text-emerald-700 font-semibold">sha256_lock</span>
                          </div>
                        </div>
                      </div>
                    </foreignObject>

                    {/* Node 2: Buyer Signs */}
                    <foreignObject x="248" y="140" width="168" height="110">
                      <div
                        onClick={() => setActiveFlowStep(2)}
                        className={`w-full h-full rounded-2xl border p-3 font-mono cursor-pointer transition-all duration-500 flex flex-col justify-between sleek-3d-card ${
                          activeFlowStep === 2
                            ? "active-step border-[var(--primary)] ring-2 ring-[var(--primary)]/40 flow-node-active"
                            : "border-[var(--border)] bg-[var(--card)]/90 opacity-90 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] uppercase font-bold tracking-wider ${activeFlowStep === 2 ? "text-[var(--primary)]" : "text-[var(--primary)]"}`}>
                            2. Buyer Signs
                          </span>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${activeFlowStep === 2 ? "bg-white text-[var(--primary)] border-[var(--primary)]/30 shadow-sm" : "bg-[var(--background)] text-[var(--primary)] border-[var(--border)]"}`}>
                            <Wallet size={12} />
                          </div>
                        </div>
                        <div className={`text-[10px] leading-tight p-1.5 rounded-lg border transition-colors ${activeFlowStep === 2 ? "bg-white/80 border-[var(--primary)]/20 text-[#2d4a46]" : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]/60"}`}>
                          <div className="flex items-center gap-1 text-[9px] font-semibold text-[var(--foreground)]">
                            <CheckCircle2 size={10} className="text-emerald-600" />
                            <span>EIP-712 Domain Bound</span>
                          </div>
                          <div className="text-[9px] mt-0.5 text-[var(--muted-foreground)]">
                            Gas: 0 · Direct Transfer
                          </div>
                        </div>
                      </div>
                    </foreignObject>

                    {/* Node 3: Arc Finality */}
                    <foreignObject x="24" y="270" width="168" height="110">
                      <div
                        onClick={() => setActiveFlowStep(3)}
                        className={`w-full h-full rounded-2xl border p-3 font-mono cursor-pointer transition-all duration-500 flex flex-col justify-between sleek-3d-card ${
                          activeFlowStep === 3
                            ? "active-step border-[var(--primary)] ring-2 ring-[var(--primary)]/40 flow-node-active"
                            : "border-[var(--border)] bg-[var(--card)]/90 opacity-90 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] uppercase font-bold tracking-wider ${activeFlowStep === 3 ? "text-[var(--primary)]" : "text-[var(--primary)]"}`}>
                            3. Arc Finality
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                            FINALIZED
                          </span>
                        </div>
                        <div className={`text-[10px] leading-tight p-1.5 rounded-lg border transition-colors ${activeFlowStep === 3 ? "bg-white/80 border-[var(--primary)]/20 text-[#2d4a46]" : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]/60"}`}>
                          <div className="flex justify-between text-[9px]">
                            <span>Block:</span>
                            <span className="text-[var(--foreground)] font-semibold">#14209124</span>
                          </div>
                          <div className="flex justify-between mt-0.5 text-[9px]">
                            <span>Receipt Proof:</span>
                            <span className="text-emerald-700 font-bold">18ms latency</span>
                          </div>
                        </div>
                      </div>
                    </foreignObject>

                    {/* Node 4: Webhook */}
                    <foreignObject x="248" y="395" width="168" height="110">
                      <div
                        onClick={() => setActiveFlowStep(4)}
                        className={`w-full h-full rounded-2xl border p-3 font-mono cursor-pointer transition-all duration-500 flex flex-col justify-between sleek-3d-card ${
                          activeFlowStep === 4
                            ? "active-step border-[var(--primary)] ring-2 ring-[var(--accent)]/60 flow-gold-active"
                            : "border-[var(--border)] bg-[var(--card)]/90 opacity-90 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] uppercase font-bold tracking-wider ${activeFlowStep === 4 ? "text-[var(--primary)]" : "text-[var(--primary)]"}`}>
                            4. Webhook
                          </span>
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${activeFlowStep === 4 ? "bg-[var(--accent)] text-[var(--primary)] border-[var(--accent)] shadow-sm" : "bg-[var(--accent)] text-[var(--primary)] border-[var(--accent)]"}`}>
                            <Webhook size={12} />
                          </div>
                        </div>
                        <div className={`text-[10px] leading-tight p-1.5 rounded-lg border transition-colors ${activeFlowStep === 4 ? "bg-white/80 border-[var(--primary)]/20 text-[#2d4a46]" : "bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]/60"}`}>
                          <div className="flex justify-between text-[9px]">
                            <span>Dispatch:</span>
                            <span className="text-emerald-700 font-bold">200 OK</span>
                          </div>
                          <div className="flex justify-between mt-0.5 text-[9px]">
                            <span>HMAC Signature:</span>
                            <span className="text-[var(--foreground)] font-mono">Verified</span>
                          </div>
                        </div>
                      </div>
                    </foreignObject>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Network Signals & Live Verification Telemetry Section */}
      <section className="antialiased min-h-screen flex flex-col overflow-hidden text-[var(--foreground)] font-sans border-t border-[var(--border)] bg-[var(--background)]">
        <div className="max-w-6xl mx-auto w-full flex-grow flex flex-col border-x border-[var(--border)] relative bg-[var(--card)]/40 backdrop-blur-[2px]">
          {/* Corner points */}
          <div className="absolute -top-[3px] -left-[3px] w-1.5 h-1.5 bg-[var(--primary)] z-20" />
          <div className="absolute -top-[3px] -right-[3px] w-1.5 h-1.5 bg-[var(--primary)] z-20" />

          {/* Header */}
          <header className="pt-20 pb-14 px-6 text-center border-b border-[var(--border)] relative z-10 font-sans">
            <h2 className="text-4xl md:text-5xl font-light tracking-tight text-[var(--foreground)] max-w-3xl mx-auto font-serif leading-tight">
              Real-time onchain <span className="italic text-[var(--primary)] font-serif">verification</span>
            </h2>

            <p className="mt-4 max-w-xl mx-auto text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed font-normal font-sans">
              Watch live Arc Network transaction verification, gasless multi-seller cart batching, and sub-second settlement dispatch.
            </p>
          </header>

          {/* 3-Column Layout: Left Stats | Center Wave Visualizer & Live Block Feed | Right Stats */}
          <main className="flex-grow relative z-10 grid lg:grid-cols-[270px_minmax(0,1fr)_270px] min-h-[580px] font-sans">
            {/* Left stats */}
            <div className="border-r border-[var(--border)] bg-[var(--card)]/30 backdrop-blur-sm grid grid-rows-2 divide-y divide-[var(--border)]">
              <div className="flex flex-col items-center justify-center text-center p-8 transition-colors hover:bg-[var(--card)]/60">
                <div className="text-4xl font-light text-[var(--foreground)] font-serif tracking-tight">
                  &lt; 850ms
                </div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)] max-w-[200px] leading-relaxed font-mono uppercase tracking-wider">
                  average block latency
                </div>
              </div>

              <div className="flex flex-col items-center justify-center text-center p-8 transition-colors hover:bg-[var(--card)]/60">
                <div className="text-4xl font-light text-[var(--primary)] font-serif tracking-tight">
                  100%
                </div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)] max-w-[200px] leading-relaxed font-mono uppercase tracking-wider">
                  EIP-712 challenge accuracy
                </div>
              </div>
            </div>

            {/* Center Animation & Live Arc Block Feed */}
            <div className="relative overflow-hidden flex flex-col justify-between p-6">
              <canvas ref={networkCanvasRef} className="absolute inset-0 w-full h-full block z-0 opacity-70" />

              {/* Live Simulated Arc Testnet Blocks Floating Banner */}
              <div className="relative z-10 w-full max-w-md mx-auto space-y-2 mt-4 font-sans">
                <div className="bg-[var(--card)]/90 backdrop-blur-md border border-[var(--border)] rounded-2xl p-4 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--background)] text-[var(--primary)] flex items-center justify-center border border-[var(--border)] text-xs font-bold font-mono">
                      ✓
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--foreground)]">Payment Verified</span>
                        <span className="text-[11px] font-mono text-[var(--primary)] bg-[var(--background)] px-1.5 py-0.5 rounded border border-[var(--border)]">Arc 5042002</span>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] font-mono mt-0.5">TX: 0x7f0a91...3b21 · 45.00 USDC</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[var(--primary)] bg-[var(--background)] px-2 py-1 rounded border border-[var(--border)] font-mono">
                    21ms
                  </span>
                </div>

                <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl p-3.5 shadow-sm flex items-center justify-between opacity-90">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[var(--background)] text-[var(--primary)] flex items-center justify-center border border-[var(--border)] text-xs font-bold font-mono">
                      ⇄
                    </div>
                    <div>
                      <span className="text-sm font-medium text-[var(--foreground)]">Multi-Seller Split (2 Merchants)</span>
                      <p className="text-xs text-[var(--muted-foreground)] font-mono">DR-8921-ARC · Parallel Settlement</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[var(--primary)] font-mono">Settled</span>
                </div>
              </div>

              {/* Bottom Network Status Bar */}
              <div className="relative z-10 bg-[var(--card)]/90 backdrop-blur-md border border-[var(--border)] rounded-2xl px-6 py-3 flex items-center justify-between text-xs text-[var(--muted-foreground)] shadow-sm max-w-md mx-auto w-full mb-2 font-sans">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-ping" />
                  <span className="font-semibold text-[var(--foreground)]">Arc Testnet Node RPC</span>
                </div>
                <span className="font-mono text-xs text-[var(--muted-foreground)]">rpc.testnet.arc.network</span>
              </div>
            </div>

            {/* Right stats */}
            <div className="border-l border-[var(--border)] bg-[var(--card)]/30 backdrop-blur-sm grid grid-rows-2 divide-y divide-[var(--border)]">
              <div className="flex flex-col items-center justify-center text-center p-8 transition-colors hover:bg-[var(--card)]/60">
                <div className="text-4xl font-light text-[var(--primary)] font-serif tracking-tight">
                  0 bps
                </div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)] max-w-[200px] leading-relaxed font-mono uppercase tracking-wider">
                  funds holding risk
                </div>
              </div>

              <div className="flex flex-col items-center justify-center text-center p-8 transition-colors hover:bg-[var(--card)]/60">
                <div className="text-4xl font-light text-[var(--foreground)] font-serif tracking-tight">
                  24 / 7
                </div>
                <div className="mt-2 text-xs text-[var(--muted-foreground)] max-w-[200px] leading-relaxed font-mono uppercase tracking-wider">
                  automated webhook dispatch
                </div>
              </div>
            </div>
          </main>

          <div className="absolute -bottom-[3px] -left-[3px] w-1.5 h-1.5 bg-[var(--primary)] z-20" />
          <div className="absolute -bottom-[3px] -right-[3px] w-1.5 h-1.5 bg-[var(--primary)] z-20" />
        </div>
      </section>

      {/* Modern Themed Site Footer */}
      <SiteFooter />
    </div>
  );
}
