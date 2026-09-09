import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";

const logo = "/DRUTO_D_logo.png";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[var(--background)] font-sans antialiased text-[var(--muted-foreground)]">
      {/* Top Brand Bar */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group transition-transform duration-300 active:scale-95">
          <img src={logo} alt="Druto logo" className="h-8 w-auto object-contain" />
          <span className="text-xl font-bold tracking-tight text-[var(--foreground)] font-serif">druto</span>
        </Link>
        <Link href="/developers" className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors">
          Developer Hub
        </Link>
      </div>

      {/* Main 404 Hero */}
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs text-[var(--primary)] bg-[var(--card)] border border-[var(--border)] shadow-sm">
          <Sparkles size={14} className="text-[var(--primary)]" />
          <span className="font-medium tracking-wide uppercase font-mono">Resource Missing</span>
        </div>

        <h1 className="text-8xl font-light font-serif text-[var(--primary)] tracking-tighter mb-4">
          404
        </h1>

        <h2 className="text-2xl sm:text-3xl font-serif font-light text-[var(--foreground)] mb-4 tracking-tight">
          Page not found on Arc Network
        </h2>

        <p className="text-[var(--muted-foreground)] mb-8 leading-relaxed text-sm font-sans">
          The requested endpoint or document route doesn't exist on this deployment. It may have been relocated or updated.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Button
            onClick={() => setLocation("/")}
            className="rounded-full bg-[var(--primary)] hover:opacity-90 text-[var(--primary-foreground)] px-7 py-3 transition-all duration-200 shadow-sm flex items-center gap-2 text-sm font-medium"
          >
            <Home className="w-4 h-4" />
            Return Home
          </Button>

          <Button
            variant="outline"
            onClick={() => setLocation("/developers")}
            className="rounded-full border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--sidebar-accent)] px-7 py-3 transition-all duration-200 flex items-center gap-2 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Developer Hub
          </Button>
        </div>
      </div>

      {/* Footer Note */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 border-t border-[var(--border)] text-center text-xs text-[var(--muted-foreground)]">
        © {new Date().getFullYear()} Druto Platform. Arc Testnet Settlement Engine.
      </div>
    </div>
  );
}
