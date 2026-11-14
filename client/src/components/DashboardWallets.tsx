import { useState } from "react";
import { Copy, ShieldCheck, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function DashboardWallets() {
  const query = trpc.merchantAccounts.listMine.useQuery(undefined, { refetchOnWindowFocus: false });
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, address: string) => {
    try { await navigator.clipboard.writeText(address); setCopied(id); }
    catch { toast.error("Could not copy. Select and copy the full address below."); }
  };
  return <div className="page-content dg-wallet-page">
    <div className="dg-section-intro"><h2>Where your payments arrive</h2><p>Registered seller destinations on Arc Testnet. Wallet ownership verification is separate from identity or business verification.</p></div>
    {query.isLoading ? <p role="status">Loading receiving wallets…</p> : query.error ? <div className="dg-error" role="alert">Receiving wallets could not be loaded.<button className="dg-text-button" onClick={() => void query.refetch()}>Try again</button></div> : !query.data?.accounts.length ? <div className="dg-empty card"><Wallet size={24} /><strong>No receiving wallets yet</strong><p>Open Sellers to register a seller and verify the receiving wallet.</p></div> : <div className="dg-wallet-directory">{query.data.accounts.map(account => <article key={account.id} className="card dg-wallet-directory-card">
      <Wallet size={21} aria-hidden="true" /><div><h3>{account.displayName}</h3><p>{account.marketplaceId} / {account.externalSellerId}</p></div>
      <span className="dg-status" data-status={account.status === "disabled" ? "Failed" : account.walletVerifiedAt ? "Verified" : "Pending"}><ShieldCheck size={12} />{account.status === "disabled" ? "Disabled" : account.walletVerifiedAt ? "Wallet verified" : "Verification pending"}</span>
      <div className="dg-wallet-full-address"><code>{account.receivingAddress}</code><button type="button" className="icon-button" aria-label={"Copy wallet for " + account.displayName} onClick={() => void copy(account.id, account.receivingAddress)}><Copy size={15} /></button></div>
      <p className="dg-wallet-note" role="status">{copied === account.id ? "Receiving address copied." : "Druto does not hold funds or execute payouts from this wallet."}</p>
    </article>)}</div>}
  </div>;
}