import { useEffect, useRef, useState } from "react";
import { CheckCheck, Copy, KeyRound, Plus, RefreshCw, ShieldCheck, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import "@/styles/dashboard-api-keys.css";

export default function ApiKeyManager({ onSellerSetup, readOnly = false }: { onSellerSetup?: () => void; readOnly?: boolean }) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [secret, setSecret] = useState<{ id: string; value: string; name: string; seller: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const creatingRef = useRef(false);
  const revealRef = useRef<HTMLElement>(null);
  const keys = trpc.apiKeys.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const accounts = trpc.merchantAccounts.listMine.useQuery(undefined, { refetchOnWindowFocus: false });
  const create = trpc.apiKeys.create.useMutation({ gcTime: 0 });
  const revoke = trpc.apiKeys.revoke.useMutation();
  const eligible = (accounts.data?.accounts ?? []).filter(account => account.status === "active" && !!account.walletVerifiedAt);
  const selectedAccount = eligible.find(account => account.id === accountId);
  const selectedKey = keys.data?.find(key => key.id === revokeId);
  const busy = create.isPending || revoke.isPending;
  useEffect(() => {
    if (!secret) return;
    revealRef.current?.focus();
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [secret]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(timer); }, [copied]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (readOnly || secret || busy || creatingRef.current) return;
    if (!name.trim() || !selectedAccount) { toast.error("Choose a verified seller and enter a recognizable key name."); return; }
    try {
      creatingRef.current = true;
      const result = await create.mutateAsync({ name: name.trim(), merchantAccountId: selectedAccount.id });
      setSecret({ id: result.id, value: result.secret, name: result.name, seller: selectedAccount.displayName });
      setSaved(false); setCopied(false); setName("");
      await keys.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "API key could not be created"); }
    finally { creatingRef.current = false; create.reset(); }
  };
  const copy = async () => {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.value); setCopied(true); }
    catch { toast.error("Copy unavailable. Select the key and copy it manually."); }
  };
  const revokeKey = async () => {
    if (!selectedKey || readOnly || confirmName !== selectedKey.name || busy) return;
    try {
      await revoke.mutateAsync({ id: selectedKey.id });
      if (secret?.id === selectedKey.id) { setSecret(null); setSaved(false); }
      setRevokeId(null); setConfirmName("");
      toast.success("API key revoked. New requests using it will be rejected.");
      await keys.refetch();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not revoke this key. Refresh its current status."); }
  };
  return <div className="dg-content ak-console">
    <div className="dg-page-head"><div><h1>API keys</h1><p>Seller-scoped credentials for your marketplace backend.</p></div><button className="dg-button" disabled={keys.isFetching || accounts.isFetching} onClick={() => void Promise.all([keys.refetch(),accounts.refetch()])}><RefreshCw size={15} />Refresh</button></div>
    <div className="ak-boundary"><ShieldCheck size={19} /><p>Server use only. A key can create checkout for its assigned seller; it cannot sign wallet transfers. API keys and webhook signing secrets are separate credentials.</p></div>
    {readOnly && <p className="ak-notice">Development preview · sample metadata only. Creating and revoking keys are disabled.</p>}
    {secret && <section ref={revealRef} tabIndex={-1} className="dg-panel dg-glass ak-reveal" aria-label="One-time API key reveal">
      <div className="ak-section-head"><KeyRound size={19} /><h2>Save this API key now</h2></div>
      <p><strong>{secret.name}</strong> · {secret.seller}. Druto stores a one-way hash. The original key cannot be retrieved after you hide it or leave this page.</p>
      <div className="ak-secret"><code>{secret.value}</code><button type="button" className="dg-button" onClick={() => void copy()}>{copied ? <CheckCheck size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy key"}</button></div>
      <label className="ak-check"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />I saved this key in my backend or Worker secret store.</label>
      <button className="dg-button" type="button" disabled={!saved} onClick={() => {setSecret(null);setSaved(false);setCopied(false);}}>Hide key permanently</button>
    </section>}
    <section className="dg-panel dg-glass ak-create"><div className="dg-panel-head"><div><h2>Create a server credential</h2><p>Only active sellers with verified receiving wallets can be selected.</p></div><KeyRound size={19} /></div>
      {accounts.isLoading ? <p className="dg-loading" role="status">Loading seller access…</p> : accounts.error ? <div className="dg-error" role="alert">Seller access could not be loaded.<button className="dg-text-button" onClick={() => void accounts.refetch()}>Try again</button></div> : !eligible.length ? <div className="dg-empty"><KeyRound size={24} /><strong>Verify a seller first</strong><p>Finish receiving-wallet verification before issuing a seller-scoped API key.</p>{onSellerSetup && <button className="dg-text-button" onClick={onSellerSetup}>Open seller setup <ArrowRight size={14} /></button>}</div> : <form className="ak-form" onSubmit={event => void submit(event)}><label>Verified seller<select required value={accountId} onChange={event => setAccountId(event.target.value)} disabled={readOnly || busy || !!secret}><option value="">Choose a seller</option>{eligible.map(account => <option key={account.id} value={account.id}>{account.displayName} · {account.marketplaceId} / {account.externalSellerId}</option>)}</select></label><label>Key name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required placeholder="e.g. Storefront test backend" disabled={readOnly || busy || !!secret} autoComplete="off" /></label><button className="dg-button dg-primary" type="submit" disabled={readOnly || busy || !!secret || !selectedAccount || !name.trim()}><Plus size={15} />{create.isPending ? "Creating…" : "Create key"}</button></form>}
      {secret && <p className="ak-form-note">Save and hide the current key before creating another.</p>}
    </section>
    <section className="dg-panel dg-glass ak-ledger"><div className="dg-panel-head"><div><h2>Your credentials</h2><p>Only masked key metadata is returned after creation.</p></div><KeyRound size={18} /></div>
      {keys.error && <div className="dg-error" role="alert">Credentials could not be refreshed{keys.data?.length ? "; loaded records may be stale." : "."}<button className="dg-text-button" onClick={() => void keys.refetch()}>Try again</button></div>}
      {keys.isLoading ? <div className="dg-loading" role="status">Loading credentials…</div> : !keys.data?.length && !keys.error ? <div className="dg-empty"><KeyRound size={24} /><strong>No API keys yet</strong><p>Create one when your verified seller's backend is ready to integrate.</p></div> : <div className="dg-table-wrap"><table><thead><tr><th scope="col">Name / key</th><th scope="col">Seller scope</th><th scope="col">Created / last used</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{keys.data?.map(key => <tr key={key.id}><td><strong>{key.name}</strong><code className="ak-mask">{key.prefix}••••{key.lastFour}</code><small>{key.id}</small></td><td><strong>{key.sellerDisplayName ?? "Unscoped legacy key"}</strong><small>{key.merchantAccountId ? key.marketplaceId + " / " + key.sellerId : "Cannot create current seller-bound checkout"}</small></td><td><time dateTime={new Date(key.createdAt).toISOString()}>{new Date(key.createdAt).toLocaleString()}</time><small>Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never recorded"}</small></td><td><span className="dg-status" data-status={key.revokedAt ? "Expired" : "Verified"}>{key.revokedAt ? "Revoked" : "Active"}</span></td><td>{!key.revokedAt ? <button type="button" className="dg-text-button ak-danger" disabled={readOnly || busy} onClick={() => {setRevokeId(key.id);setConfirmName("");}}>Revoke key</button> : <span className="ak-muted">No longer usable</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <footer className="dg-footer"><span>Arc Testnet · times in your device timezone</span><span>Revocation does not sign out a wallet session or rotate webhook secrets.</span></footer>
    <Dialog open={!!selectedKey} onOpenChange={open => {if (!open && !revoke.isPending) {setRevokeId(null);setConfirmName("");}}}>
      <DialogContent className="dashboard-payment-detail ak-revoke-dialog"><DialogTitle>Revoke this API key?</DialogTitle><DialogDescription>This blocks new authenticated requests using this credential. Existing payments and webhook deliveries remain recorded; your receiving wallet is unchanged.</DialogDescription>
        {selectedKey && <><dl className="dg-detail-list"><div><dt>Key name</dt><dd>{selectedKey.name}</dd></div><div><dt>Masked key</dt><dd>{selectedKey.prefix}••••{selectedKey.lastFour}</dd></div><div><dt>Seller</dt><dd>{selectedKey.sellerDisplayName ?? "Unscoped legacy key"}</dd></div></dl><label className="ak-confirm">Type the exact key name to confirm<input value={confirmName} onChange={event => setConfirmName(event.target.value)} autoComplete="off" spellCheck={false} /></label><div className="ak-dialog-actions"><button type="button" className="dg-button" disabled={revoke.isPending} onClick={() => {setRevokeId(null);setConfirmName("");}}>Keep key</button><button type="button" className="dg-button ak-revoke-button" disabled={readOnly || busy || confirmName !== selectedKey.name} onClick={() => void revokeKey()}>{revoke.isPending ? "Revoking…" : "Revoke key"}</button></div></>}
      </DialogContent>
    </Dialog>
  </div>;
}