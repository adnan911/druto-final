import { trpc } from "@/lib/trpc";
import { Check, Clipboard, KeyRound, Plus, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

async function copySecret(secret: string) {
  try {
    await navigator.clipboard.writeText(secret);
    toast.success("API key copied");
  } catch {
    toast.info("Copy is unavailable; select the key manually from the one-time reveal.");
  }
}

export default function ApiKeyManager() {
  const [name, setName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const keys = trpc.apiKeys.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const create = trpc.apiKeys.create.useMutation({
    onSuccess: result => {
      setCreatedSecret(result.secret);
      setName("");
      void keys.refetch();
      toast.success("API key created. Copy it now; it will not be shown again.");
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => { void keys.refetch(); toast.success("API key revoked"); },
    onError: error => toast.error(error.message),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return toast.error("Give this key a recognizable name");
    create.mutate({ name: name.trim() });
  };
  return <div className="page-content">
    <PageHeaderLite />
    {createdSecret && <div className="card api-key-reveal"><div className="api-key-reveal-head"><div><span className="eyebrow">One-time reveal</span><h3>Save this API key now</h3></div><button className="icon-button" aria-label="Dismiss API key reveal" onClick={() => setCreatedSecret(null)}><X size={17} /></button></div><p>Druto stores only a one-way hash. This plaintext value will not be shown again after you dismiss this panel.</p><div className="api-key-secret"><code>{createdSecret}</code><button className="button button-quiet" onClick={() => void copySecret(createdSecret)}><Clipboard size={14} /> Copy key</button></div></div>}
    <div className="card api-key-create"><div><span className="eyebrow">Create a credential</span><h3>Issue a server-side API key</h3><p>Use this key from your marketplace backend to create Payment Intents. Never ship it in browser code or commit it to source control.</p></div><form onSubmit={submit} className="api-key-form"><label htmlFor="api-key-name">Key name</label><div className="api-key-form-row"><input id="api-key-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="e.g. Marketplace production adapter" /><button className="button button-primary" type="submit" disabled={create.isPending}><Plus size={15} /> {create.isPending ? "Creating…" : "Create key"}</button></div></form></div>
    <div className="card table-card api-key-table"><div className="card-heading"><div><span className="eyebrow">Credentials</span><h3>Your API keys</h3></div><KeyRound size={18} /></div>{keys.isLoading ? <p className="muted-cell">Loading credentials…</p> : !keys.data?.length ? <div className="empty-feature compact-empty"><div className="empty-icon"><KeyRound size={19} /></div><h3>No API keys yet</h3><p>Create a key when your marketplace backend is ready to connect to Druto.</p></div> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th>Status</th><th /></tr></thead><tbody>{keys.data.map(key => <tr key={key.id}><td><strong>{key.name}</strong></td><td><code>{key.prefix}••••{key.lastFour}</code></td><td>{new Date(key.createdAt).toLocaleDateString()}</td><td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</td><td>{key.revokedAt ? <span className="status-pill status-neutral"><X size={12} /> Revoked</span> : <span className="status-pill status-success"><Check size={12} /> Active</span>}</td><td>{!key.revokedAt && <button className="button button-quiet" onClick={() => { if (window.confirm(`Revoke ${key.name}? Existing requests using it will stop working.`)) revoke.mutate({ id: key.id }); }} disabled={revoke.isPending}>Revoke</button>}</td></tr>)}</tbody></table></div>}</div>
    <div className="card api-key-security"><ShieldCheck size={17} /><div><strong>Credential boundary</strong><p>API keys authenticate server-to-server requests only. Payment amounts, seller wallets, ownership signatures, and buyer transactions remain subject to Druto’s server-side validation rules.</p></div></div>
  </div>;
}

function PageHeaderLite() { return <div className="page-header"><div><span className="eyebrow">Developer access</span><h1>API keys</h1><p>Create and revoke credentials for the marketplace systems that call Druto.</p></div><span className="status-pill status-success"><span className="live-dot" /> Arc Testnet</span></div>; }
