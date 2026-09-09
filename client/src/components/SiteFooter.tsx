import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";

export default function SiteFooter() {
  const currentYear = new Date().getFullYear();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="w-full bg-[var(--background)] border-t border-[var(--border)] text-[var(--foreground)] relative overflow-hidden antialiased">
      {/* Soft Ambient Brand Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[900px] h-[340px] rounded-full bg-gradient-to-b from-[var(--primary)]/6 via-[var(--secondary)]/8 to-transparent blur-3xl opacity-70" />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10 pt-20 pb-12">
        {/* Top Callout Hero Block */}
        <div className="relative rounded-3xl p-8 sm:p-12 lg:p-14 bg-gradient-to-br from-[var(--card)]/90 via-[var(--card)]/60 to-[var(--background)] border border-[var(--border)] shadow-sm mb-16 overflow-hidden backdrop-blur-sm">
          {/* Subtle Corner Accents */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-radial from-[var(--primary)]/10 to-transparent pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-radial from-[var(--secondary)]/15 to-transparent pointer-events-none" />

          <div className="max-w-3xl">
            {/* Main Headline */}
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[var(--foreground)] font-serif leading-[1.15]">
              Stablecoin payments,{" "}
              <span className="italic text-[var(--primary)] font-serif block sm:inline">
                built for the real flow.
              </span>
            </h2>

            {/* Description */}
            <p className="mt-5 text-base sm:text-lg text-[var(--muted-foreground)] font-sans leading-relaxed font-normal">
              Druto gives marketplaces and internet businesses the payment intents, hosted checkout, wallet verification, and signed events they need to move USDC with confidence.
            </p>

            {/* Action CTA */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/developers/start"
                onClick={scrollToTop}
                className="inline-flex items-center gap-2 h-11 px-7 rounded-full bg-[var(--primary)] hover:opacity-95 text-[var(--primary-foreground)] text-sm font-medium tracking-wide transition-all shadow-sm active:scale-95 font-sans"
              >
                <span>Start with Druto</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Links & Community Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 pb-12 border-b border-[var(--border)] font-sans">
          {/* Engineering */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-semibold tracking-wider text-[var(--foreground)] font-mono">
              Engineering
            </h4>
            <ul className="flex flex-wrap items-center gap-6 text-sm">
              <li>
                <a
                  href="https://docs.arc.network"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1"
                >
                  <span>Arc Documentation</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
              <li>
                <a
                  href="https://testnet.arcscan.app"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1"
                >
                  <span>ArcScan Explorer</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-semibold tracking-wider text-[var(--foreground)] font-mono">
              Community
            </h4>

            <div className="flex items-center gap-2 pt-0.5 text-[var(--muted-foreground)]">
              {/* X (Twitter) */}
              <a
                href="https://x.com/druto_app"
                target="_blank"
                rel="noreferrer"
                aria-label="X (Twitter)"
                className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:text-[var(--foreground)] hover:border-[var(--primary)]/40 transition-all shadow-xs"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              {/* GitHub (Frozen) */}
              <button
                type="button"
                aria-label="GitHub"
                title="GitHub (Public repository releasing soon)"
                className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all shadow-xs cursor-default"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
              </button>

              {/* Arc Community */}
              <a
                href="https://arc.network"
                target="_blank"
                rel="noreferrer"
                aria-label="Arc Network"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:text-[var(--foreground)] hover:border-[var(--primary)]/40 transition-all text-xs font-sans font-medium shadow-xs"
              >
                <span>Arc Ecosystem</span>
                <ArrowUpRight className="w-3 h-3 text-[var(--muted-foreground)]" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--muted-foreground)] font-sans">
          <div className="flex items-center gap-2">
            <span className="text-[var(--foreground)] font-semibold tracking-tight">
              Druto Payments
            </span>
            <span>·</span>
            <span>© {currentYear} All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}



