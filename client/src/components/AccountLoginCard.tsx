import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ExternalLink, Mail, ShieldCheck, UserCheck, Wallet } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { toast } from "sonner";

export default function AccountLoginCard() {
  const [email, setEmail] = useState("");
  const [isWalletSigning, setIsWalletSigning] = useState(false);

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

  const handleWalletSignIn = async () => {
    setIsWalletSigning(true);
    try {
      let activeAddress = address;
      if (!isConnected || !activeAddress) {
        const connector = connectors[0];
        if (!connector) throw new Error("No EVM wallet detected (e.g. MetaMask). Please install an EVM wallet.");
        const connectResult = await connectAsync({ connector });
        activeAddress = connectResult.accounts[0];
      }

      if (!activeAddress) {
        throw new Error("Could not retrieve wallet address from provider.");
      }

      const challenge = await createChallenge.mutateAsync({ walletAddress: activeAddress });
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await verifyWallet.mutateAsync({
        challengeId: challenge.challengeId,
        walletAddress: activeAddress,
        signature,
      });

      if (result?.token) {
        try {
          sessionStorage.setItem("manus-cookie", `app_session_id=${result.token}`);
        } catch {
          // Ignore
        }
      }

      await utils.auth.me.invalidate();
      toast.success("Wallet authenticated successfully");
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error("[Wallet Sign-in Error]", error);
      toast.error(error?.message || "Wallet sign-in could not be completed");
    } finally {
      setIsWalletSigning(false);
    }
  };

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

  const isPending = directLogin.isPending || privyAccountLogin.isPending || isWalletSigning || createChallenge.isPending || verifyWallet.isPending;

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
            Sign in with your EVM wallet, email, or Privy account to access the Druto workspace.
            Manage payments, track verified Arc Testnet settlements, view API credentials, and monitor webhooks.
          </p>
          <div className="wallet-login-proof">
            <span><ShieldCheck size={16} /> EVM & Privy authentication</span>
            <span><Wallet size={16} /> Instant merchant wallet linkage</span>
          </div>
        </section>

        <section className="wallet-login-card">
          <span className="eyebrow">Dashboard access</span>
          <h2>Sign in to Druto</h2>
          <p>
            Access your merchant workspace with your EVM wallet or Privy credentials.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", margin: "16px 0" }}>
            <button
              type="button"
              className="button button-primary wallet-login-button"
              onClick={handleWalletSignIn}
              disabled={isPending}
              style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "12px", background: "#2458d6", color: "#fff" }}
            >
              <Wallet size={16} />
              {isWalletSigning ? "Signing challenge…" : address ? `Sign in as ${address.slice(0, 6)}…${address.slice(-4)}` : "Connect & Sign with EVM Wallet"}
              <ArrowRight size={15} />
            </button>

            {privy && (
              <button
                type="button"
                className="button button-quiet"
                onClick={handlePrivySignIn}
                disabled={!privy.ready || isPending}
                style={{ width: "100%", fontSize: "13px", color: "#333", border: "1px solid #ddd", padding: "10px" }}
              >
                <UserCheck size={14} /> Sign in with Privy (Email / Social)
              </button>
            )}
          </div>

          <div style={{ position: "relative", textAlign: "center", margin: "14px 0" }}>
            <hr style={{ border: "0", borderTop: "1px solid #eee" }} />
            <span style={{ position: "absolute", top: "-9px", left: "50%", transform: "translateX(-50%)", background: "#fff", padding: "0 8px", fontSize: "12px", color: "#888" }}>
              or email sign-in
            </span>
          </div>

          <form onSubmit={handleDirectSignIn} style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "left", fontSize: "13px", fontWeight: 500 }}>
              Email address
              <input
                type="email"
                placeholder="seller@mystore.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px" }}
              />
            </label>

            <button
              type="submit"
              className="button button-quiet"
              disabled={isPending}
              style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "10px", fontSize: "13px" }}
            >
              <Mail size={15} />
              {email ? "Continue with Email" : "Direct Operator Sign-in"}
            </button>
          </form>

          <div className="wallet-login-note" style={{ marginTop: "16px" }}>
            <ShieldCheck size={14} />
            <span>Secure signature authentication. Your private keys never leave your wallet.</span>
          </div>

          <a className="wallet-help-link" href="/developers">
            <ExternalLink size={13} /> Read the Developer Kit
          </a>
        </section>
      </div>
    </main>
  );
}
