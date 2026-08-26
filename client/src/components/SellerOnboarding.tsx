import { trpc } from "@/lib/trpc";
import { Check, Clipboard, ExternalLink, KeyRound, ShieldCheck, WalletCards, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

async function copyValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.info(`Copy unavailable; select the ${label.toLowerCase()} manually.`);
  }
}

export default function SellerOnboarding() {
  const [marketplaceId, setMarketplaceId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [receivingAddress, setReceivingAddress] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [merchantStatus, setMerchantStatus] = useState<"pending" | "active" | null>(null);

  const accountsQuery = trpc.merchantAccounts.listMine.useQuery(undefined, { refetchOnWindowFocus: false });
  const keysQuery = trpc.apiKeys.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const register = trpc.merchantAccounts.register.useMutation();
  const createKey = trpc.apiKeys.create.useMutation();
  const registerWebhook = trpc.merchantAccounts.registerWebhook.useMutation();
  const busy = register.isPending || createKey.isPending || registerWebhook.isPending;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!marketplaceId.trim() || !sellerId.trim() || !displayName.trim() || !/^0x[a-f-fA-F0-9]{40}$/.test(receivingAddress.trim())) {
      toast.error("Complete the seller identity and valid 0x wallet address");
      return;
    }
    if (!/^https:\/\//.test(webhookUrl.trim()) && !/^http:\/\/localhost(?::\d+)?\//.test(`${webhookUrl.trim()}/`)) {
      toast.error("Use an HTTPS webhook URL (localhost HTTP is allowed for development)");
      return;
    }
    try {
      const seller = { marketplaceId: marketplaceId.trim(), sellerId: sellerId.trim() };
      const account = await register.mutateAsync({ marketplaceId: seller.marketplaceId, sellerId: seller.sellerId, displayName: displayName.trim(), receivingAddress: receivingAddress.trim() });
      setMerchantStatus(account.status === "active" ? "active" : "pending");
      const key = await createKey.mutateAsync({ name: `${displayName.trim()} · Druto integration`, merchantAccountId: account.id });
      setApiKey(key.secret);
      const endpoint = await registerWebhook.mutateAsync({ seller, url: webhookUrl.trim() });
      setWebhookSecret(endpoint.secret);
      await Promise.all([utils.apiKeys.list.invalidate(), utils.merchantAccounts.listMine.invalidate()]);
      toast.success("Seller workspace created. Save both credentials now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not finish seller onboarding");
    }
  };

  return <div className="page-content seller-onboarding-page">
    <div className="page-header"><div><span className="eyebrow">Seller setup</span><h1>Start accepting with Druto</h1><p>Register your website, provision server credentials, and prepare the webhook that keeps payments synchronized.</p></div><span className="status-pill status-success"><span className="live-dot" /> Arc Testnet · USDC</span></div>
    <div className="onboarding-progress"><div className="onboarding-progress-step"><span>01</span><strong>Register seller</strong><small>Identity + receiving wallet</small></div><div className="onboarding-progress-step"><span>02</span><strong>Provision credentials</strong><small>API key + webhook secret</small></div><div className="onboarding-progress-step"><span>03</span><strong>Verify ownership</strong><small>Sign before activation</small></div></div>
    {merchantStatus && <div className="card onboarding-success"><Check size={18} /><div><strong>Seller account created as {merchantStatus}</strong><p>Complete the wallet ownership challenge, then an authorized operator can activate this account for customer checkout.</p></div></div>}
    {(apiKey || webhookSecret) && <div className="card onboarding-secrets"><div className="card-heading"><div><span className="eyebrow">One-time reveal</span><h3>Save these server credentials now</h3></div><ShieldCheck size={18} /></div><p>Druto stores the API key hash and encrypted webhook secret. The plaintext values will not be shown again after leaving this screen.</p>{apiKey && <div className="secret-row"><div><span>API key</span><code>{apiKey}</code></div><button className="button button-quiet" onClick={() => void copyValue(apiKey, "API key")}><Clipboard size={14} /> Copy</button></div>}{webhookSecret && <div className="secret-row"><div><span>Webhook secret</span><code>{webhookSecret}</code></div><button className="button button-quiet" onClick={() => void copyValue(webhookSecret, "Webhook secret")}><Clipboard size={14} /> Copy</button></div>}</div>}
    <div className="card credential-ledger"><div className="card-heading"><div><span className="eyebrow">Persistent records</span><h3>Credentials and seller identities</h3></div><KeyRound size={18} /></div><p>After refresh, Druto keeps the credential ID, prefix, last four characters, seller IDs, display name, webhook URL, and lifecycle state. Plaintext secrets are intentionally never recoverable.</p>{keysQuery.isLoading || accountsQuery.isLoading ? <div className="ledger-empty">Loading saved credential records…</div> : <div className="credential-ledger-grid"><div><strong>API keys</strong>{(keysQuery.data ?? []).length === 0 ? <span className="ledger-empty">No API keys created yet.</span> : (keysQuery.data ?? []).map(key => <div className="credential-record" key={key.id}><div><code>{key.prefix}••••{key.lastFour}</code><strong>{key.sellerDisplayName ?? key.name}</strong><small>ID {key.id} · {key.marketplaceId ?? "Unlinked marketplace"} / {key.sellerId ?? "Unlinked seller"}</small></div><span className={`status-pill ${key.revokedAt ? "status-neutral" : "status-success"}`}>{key.revokedAt ? "Revoked" : "Active"}</span></div>)}</div><div><strong>Seller accounts and webhooks</strong>{(accountsQuery.data?.accounts ?? []).length === 0 ? <span className="ledger-empty">No seller accounts created yet.</span> : (accountsQuery.data?.accounts ?? []).map(account => <div className="credential-record" key={account.id}><div><strong>{account.displayName}</strong><small>ID {account.id} · {account.marketplaceId} / {account.externalSellerId}</small>{(accountsQuery.data?.webhooks ?? []).filter(webhook => webhook.merchantAccountId === account.id).map(webhook => <small key={webhook.id}>Webhook {webhook.url} · {webhook.active ? "active" : "inactive"}</small>)}</div><span className={`status-pill ${account.status === "active" ? "status-success" : "status-neutral"}`}>{account.status}</span></div>)}</div></div>}</div>
    <form className="card onboarding-form" onSubmit={submit}><div className="card-heading"><div><span className="eyebrow">Step 1 · Seller identity</span><h3>Connect your website to Druto</h3></div><WalletCards size={18} /></div><p>Use a stable seller ID from your website. The wallet address is public, but its ownership must be proven by signature before activation.</p><div className="onboarding-fields"><label>Marketplace ID<input value={marketplaceId} onChange={event => setMarketplaceId(event.target.value)} placeholder="dashda" maxLength={128} /></label><label>Seller ID<input value={sellerId} onChange={event => setSellerId(event.target.value)} placeholder="seller_123" maxLength={128} /></label><label className="field-wide">Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Dashda Clothing" maxLength={255} /></label><label className="field-wide">Arc Testnet receiving wallet<input value={receivingAddress} onChange={event => setReceivingAddress(event.target.value)} placeholder="0x..." maxLength={42} spellCheck={false} /></label><label className="field-wide">Webhook URL<input value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)} placeholder="https://dashda.com/api/webhooks/druto" type="url" maxLength={2048} /></label></div><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Provisioning seller workspace…" : "Create seller workspace"} <ExternalLink size={14} /></button></form>
    <div className="onboarding-boundaries"><div><KeyRound size={17} /><span><strong>API key</strong><small>Use only from your website backend to create Payment Intents.</small></span></div><div><Webhook size={17} /><span><strong>Webhook secret</strong><small>Use only on your backend to verify signed payment.verified events.</small></span></div><div><ShieldCheck size={17} /><span><strong>Wallet proof</strong><small>Ownership signature is offchain and never asks for a seed phrase.</small></span></div></div>
  </div>;
}
