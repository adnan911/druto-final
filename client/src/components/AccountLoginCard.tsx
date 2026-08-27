import { trpc } from "@/lib/trpc";
import { ArrowRight, ExternalLink, Mail, ShieldCheck } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";

export default function AccountLoginCard() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const accountLogin = trpc.auth.privyLogin.useMutation();
  const utils = trpc.useUtils();

  const continueWithAccount = async () => {
    try {
      if (!authenticated) {
        login();
        return;
      }
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Your account session is not ready yet");
      await accountLogin.mutateAsync({ accessToken });
      await utils.auth.me.invalidate();
      toast.success("Account connected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account sign-in could not be completed");
    }
  };

  return <main className="wallet-login-shell">
    <div className="wallet-login-grid">
      <section className="wallet-login-copy">
        <div className="public-brand"><img src="/manus-storage/druto-arc-mark_c8c084dd.png" alt="" /><strong>druto</strong></div>
        <span className="public-kicker"><span className="live-dot" /> Druto workspace</span>
        <h1>Operate your stablecoin flow from one ledger.</h1>
        <p>Sign in with your email or social account to access the Druto workspace. Wallet connection can be added later without changing your seller, payment, or webhook data.</p>
        <div className="wallet-login-proof"><span><ShieldCheck size={16} /> Secure account session</span><span><Mail size={16} /> Email or social access</span></div>
      </section>
      <section className="wallet-login-card">
        <span className="eyebrow">Dashboard access</span>
        <h2>Sign in to Druto</h2>
        <p>Use the configured account provider to create a secure dashboard session. No wallet connection or transaction is requested in this mode.</p>
        <button className="button button-primary wallet-login-button" onClick={() => void continueWithAccount()} disabled={!ready || accountLogin.isPending}><Mail size={17} /> {accountLogin.isPending ? "Connecting account…" : authenticated ? "Continue with account" : "Continue with email or social"} <ArrowRight size={15} /></button>
        <div className="wallet-login-note"><ShieldCheck size={14} /><span>Account authentication is separate from payment settlement. Wallet and Arc signing can be reintroduced later.</span></div>
        <a className="wallet-help-link" href="/developers/start"><ExternalLink size={13} /> Read the integration guide</a>
      </section>
    </div>
  </main>;
}
