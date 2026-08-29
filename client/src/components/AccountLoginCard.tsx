import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ExternalLink, Mail, ShieldCheck, UserCheck } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";

export default function AccountLoginCard() {
  const [email, setEmail] = useState("");
  const directLogin = trpc.auth.directAccountLogin.useMutation();
  const privyAccountLogin = trpc.auth.privyLogin.useMutation();
  const utils = trpc.useUtils();

  let privy: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    privy = usePrivy();
  } catch {
    privy = null;
  }

  const handleDirectSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const result = await directLogin.mutateAsync({
        email: email.trim() || undefined,
        name: email.trim() ? email.trim().split("@")[0] : undefined,
      });
      if (result?.token) {
        try {
          sessionStorage.setItem("manus-cookie", `app_session_id=${result.token}`);
        } catch {
          // Ignore
        }
      }
      await utils.auth.me.invalidate();
      toast.success("Signed in to Druto workspace");
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in could not be completed");
    }
  };

  const handlePrivySignIn = async () => {
    if (!privy) return handleDirectSignIn();
    try {
      if (!privy.authenticated) {
        privy.login();
        return;
      }
      const accessToken = await privy.getAccessToken();
      if (!accessToken) throw new Error("Your account session is not ready yet");
      await privyAccountLogin.mutateAsync({ accessToken });
      await utils.auth.me.invalidate();
      toast.success("Account connected");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account sign-in could not be completed");
    }
  };

  const isPending = directLogin.isPending || privyAccountLogin.isPending;

  return (
    <main className="wallet-login-shell">
      <div className="wallet-login-grid">
        <section className="wallet-login-copy">
          <div className="public-brand">
            <img src="/manus-storage/druto-arc-mark_c8c084dd.png" alt="" />
            <strong>druto</strong>
          </div>
          <span className="public-kicker">
            <span className="live-dot" /> Druto workspace
          </span>
          <h1>Operate your stablecoin flow from one ledger.</h1>
          <p>
            Sign in with your email or operator account to access the Druto workspace.
            Manage payments, track verified Arc Testnet settlements, view API credentials, and monitor webhooks.
          </p>
          <div className="wallet-login-proof">
            <span><ShieldCheck size={16} /> Secure account session</span>
            <span><Mail size={16} /> Email or operator access</span>
          </div>
        </section>

        <section className="wallet-login-card">
          <span className="eyebrow">Dashboard access</span>
          <h2>Sign in to Druto</h2>
          <p>
            Access your merchant workspace. No wallet connection is required for dashboard access.
          </p>

          <form onSubmit={handleDirectSignIn} style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", margin: "16px 0" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", fontSize: "13px", fontWeight: 500 }}>
              Email address
              <input
                type="email"
                placeholder="operator@druto.xyz"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px" }}
              />
            </label>

            <button
              type="submit"
              className="button button-primary wallet-login-button"
              disabled={isPending}
              style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "12px" }}
            >
              <Mail size={16} />
              {isPending ? "Signing in…" : email ? "Sign in with Email" : "Sign in as Workspace Operator"}
              <ArrowRight size={15} />
            </button>
          </form>

          {privy && (
            <button
              type="button"
              className="button button-quiet"
              onClick={handlePrivySignIn}
              disabled={!privy.ready || isPending}
              style={{ width: "100%", fontSize: "13px", color: "#555", marginTop: "4px" }}
            >
              <UserCheck size={14} /> Continue with Social / SSO
            </button>
          )}

          <div className="wallet-login-note" style={{ marginTop: "16px" }}>
            <ShieldCheck size={14} />
            <span>Account authentication is separate from buyer payment transfers. No wallet signature is required to manage the dashboard.</span>
          </div>

          <a className="wallet-help-link" href="/developers">
            <ExternalLink size={13} /> Read the Developer Kit
          </a>
        </section>
      </div>
    </main>
  );
}
