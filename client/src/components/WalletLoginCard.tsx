import { trpc } from "@/lib/trpc";
import { ArrowRight, ExternalLink, Mail, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { getWalletLoginMode, walletLoginMessage } from "@/lib/wallet-login";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletWindow = Window & { ethereum?: EthereumProvider };

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function WalletLoginCard() {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletMode, setWalletMode] = useState<ReturnType<typeof getWalletLoginMode>>("unavailable");
  const walletChallenge = trpc.auth.walletChallenge.useMutation();
  const walletLogin = trpc.auth.walletLogin.useMutation();
  const privyLogin = trpc.auth.privyLogin.useMutation();
  const utils = trpc.useUtils();
  const { ready: privyReady, authenticated: privyAuthenticated, login, getAccessToken } = usePrivy();

  useEffect(() => {
    const ethereum = (window as WalletWindow).ethereum;
    setWalletMode(getWalletLoginMode(ethereum, privyReady));
  }, [privyReady]);

  useEffect(() => {
    if (!privyReady || !privyAuthenticated) return;
    let active = true;
    void getAccessToken().then(async accessToken => {
      if (!active || !accessToken) return;
      try {
        await privyLogin.mutateAsync({ accessToken });
        await utils.auth.me.invalidate();
        toast.success("Privy session connected");
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Privy session could not be established");
      }
    });
    return () => { active = false; };
  }, [getAccessToken, privyAuthenticated, privyReady]);

  const connectAndSign = async () => {
    const ethereum = (window as WalletWindow).ethereum;
    const mode = getWalletLoginMode(ethereum, privyReady);
    if (mode !== "injected") {
      if (mode === "hosted") {
        toast.info(walletLoginMessage(mode));
        login();
      } else {
        toast.error(walletLoginMessage(mode));
      }
      return;
    }
    setBusy(true);
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const walletAddress = accounts[0];
      if (!walletAddress) throw new Error("No wallet account was selected");
      setAddress(walletAddress);
      const challenge = await walletChallenge.mutateAsync({ walletAddress, origin: window.location.origin });
      const signature = await ethereum.request({ method: "personal_sign", params: [challenge.message, walletAddress] }) as `0x${string}`;
      await walletLogin.mutateAsync({ challengeId: challenge.challengeId, nonce: challenge.nonce, signature });
      await utils.auth.me.invalidate();
      toast.success(`Wallet connected: ${shortAddress(walletAddress)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet login was cancelled");
    } finally {
      setBusy(false);
    }
  };

  return <main className="wallet-login-shell">
    <div className="wallet-login-grid">
      <section className="wallet-login-copy">
        <div className="public-brand"><img src="/manus-storage/druto-arc-mark_c8c084dd.png" alt="" /><strong>druto</strong></div>
        <span className="public-kicker"><span className="live-dot" /> Arc Testnet workspace</span>
        <h1>Operate your stablecoin flow from one ledger.</h1>
        <p>Connect the wallet that owns your Druto workspace. Login is an offchain signature—no USDC transfer, gas transaction, or private key is requested.</p>
        <div className="wallet-login-proof"><span><ShieldCheck size={16} /> Domain-bound message</span><span><WalletCards size={16} /> EVM wallet access</span></div>
      </section>
      <section className="wallet-login-card">
        <span className="eyebrow">Dashboard access</span>
        <h2>Connect your wallet</h2>
        <p>Druto uses the Arc Testnet wallet signature to create a secure dashboard session. Your address stays yours.</p>
        {address && <div className="wallet-selected"><span className="live-dot" /><span><small>Selected wallet</small><strong>{shortAddress(address)}</strong></span></div>}
        <button className="button button-primary wallet-login-button" onClick={connectAndSign} disabled={busy || walletMode === "unavailable"}><WalletCards size={17} /> {busy ? "Waiting for signature…" : "Connect wallet"} <ArrowRight size={15} /></button>
        <p className="wallet-login-provider-hint">No browser extension? Hosted wallet login opens automatically.</p>
        <div className="wallet-login-divider"><span>or</span></div>
        <button className="button button-quiet wallet-login-button" onClick={() => login()} disabled={!privyReady || privyLogin.isPending}><Mail size={17} /> {privyLogin.isPending ? "Connecting account…" : "Continue with email or social"} <ArrowRight size={15} /></button>
        <div className="wallet-login-note"><ShieldCheck size={14} /><span>Wallet login uses an offchain signature when an injected wallet is available. If not, Druto opens the configured hosted wallet login; no USDC transfer or private key is requested.</span></div>
        <a className="wallet-help-link" href="https://docs.arc.network" target="_blank" rel="noreferrer">Need Arc Testnet setup help <ExternalLink size={13} /></a>
      </section>
    </div>
  </main>;
}
