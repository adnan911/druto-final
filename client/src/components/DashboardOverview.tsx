import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, CheckCheck, Clock3, Code2, Copy, ExternalLink, Plus, Search, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatAtomicUsdc } from "@shared/usdc-amount";
import { toast } from "sonner";
import { dashboardAmount, dashboardCsvCell, dashboardPaymentStatus } from "@/lib/dashboardView";
import "@/styles/dashboard-glass.css";
import FluidSurface from "@/components/FluidSurface";
import "@/styles/dashboard-fluid.css";

type PaymentStatus = "Verified" | "Pending" | "Ready" | "Expired" | "Failed" | "Needs review";
type Period = "all" | "30" | "7" | "today";

const displayAmount = dashboardAmount;

function dateValue(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function inPeriod(time: number, period: Period): boolean {
  if (period === "all") return true;
  if (!time) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period !== "today") start.setDate(start.getDate() - (Number(period) - 1));
  return time >= start.getTime();
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "DR";
}

const statusNames = ["All", "Verified", "Pending", "Ready", "Expired", "Failed", "Needs review"] as const;

export default function DashboardOverview({ setActive, onCreate, createLabel = "Create payment" }: { setActive: (page: string) => void; onCreate: () => void; createLabel?: string }) {
  const intents = trpc.payments.listIntents.useQuery(undefined, { refetchInterval: 15000 });
  const transfers = trpc.payments.verifiedPayments.useQuery(undefined, { refetchInterval: 15000 });
  const sellers = trpc.merchantAccounts.listMine.useQuery(undefined, { refetchOnWindowFocus: false });
  const [now, setNow] = useState(Date.now);
  const [period, setPeriod] = useState<Period>("all");
  const [filter, setFilter] = useState<(typeof statusNames)[number]>("All");
  const [query, setQuery] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const copyReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyReset.current) clearTimeout(copyReset.current); }, []);

  const accounts = sellers.data?.accounts ?? [];
  const selectedSeller = accounts.find(account => account.id === sellerId) ?? accounts.find(account => account.status === "active") ?? accounts[0];
  const webhooks = sellers.data?.webhooks ?? [];
  const activeWebhooks = webhooks.filter(endpoint => endpoint.active);
  const loading = intents.isLoading || transfers.isLoading;
  const error = intents.error || transfers.error;

  const rows = useMemo(() => {
    const evidence = new Map((transfers.data ?? []).map(transfer => [transfer.paymentIntentId, transfer]));
    const accountNames = new Map((sellers.data?.accounts ?? []).map(account => [account.id, account.displayName]));
    const known = new Set((intents.data ?? []).map(intent => intent.id));
    const requested = (intents.data ?? []).map(intent => {
      const transfer = evidence.get(intent.id);
      const status: PaymentStatus = dashboardPaymentStatus(intent, !!transfer, now);
      return {
        id: intent.id,
        order: intent.externalOrderId,
        item: intent.itemName,
        seller: (intent.merchantAccountId ? accountNames.get(intent.merchantAccountId) : undefined) || "Seller payment",
        buyer: intent.buyerLabel,
        amountAtomic: transfer?.amountAtomic ?? intent.amountAtomic,
        status,
        pending: status === "Pending" || status === "Ready",
        time: dateValue(transfer?.finalizedAt ?? intent.createdAt),
        address: transfer?.toAddress ?? intent.merchantAddress,
        hash: transfer?.transactionHash ?? intent.transactionHash,
      };
    });
    // Older verified records can exist without a matching request in this response.
    const legacy = (transfers.data ?? []).filter(transfer => !known.has(transfer.paymentIntentId)).map(transfer => ({
      id: transfer.paymentIntentId,
      order: transfer.externalOrderId,
      item: transfer.itemName,
      seller: (sellers.data?.accounts ?? []).find(account => account.receivingAddress.toLowerCase() === transfer.toAddress.toLowerCase())?.displayName || "Seller payment",
      buyer: transfer.buyerLabel,
      amountAtomic: transfer.amountAtomic,
      status: "Verified" as PaymentStatus,
      pending: false,
      time: dateValue(transfer.finalizedAt ?? transfer.createdAt),
      address: transfer.toAddress,
      hash: transfer.transactionHash,
    }));
    return [...requested, ...legacy].sort((a, b) => b.time - a.time);
  }, [intents.data, transfers.data, sellers.data?.accounts, now]);

  const periodRows = rows.filter(row => inPeriod(row.time, period));
  const paidRows = periodRows.filter(row => row.status === "Verified");
  const pendingRows = periodRows.filter(row => row.pending);
  const volume = paidRows.reduce((sum, row) => sum + BigInt(row.amountAtomic), BigInt(0));
  const pendingVolume = pendingRows.reduce((sum, row) => sum + BigInt(row.amountAtomic), BigInt(0));
  const search = query.trim().toLowerCase();
  const visibleRows = periodRows.filter(row => (filter === "All" || row.status === filter) && (!search || [row.order, row.id, row.item, row.seller, row.buyer, row.hash].filter(Boolean).join(" ").toLowerCase().includes(search)));
  const selected = rows.find(row => row.id === selectedId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const copyAddress = async () => {
    if (!selectedSeller) return;
    try {
      await navigator.clipboard.writeText(selectedSeller.receivingAddress);
      setCopiedAddress(selectedSeller.receivingAddress);
      if (copyReset.current) clearTimeout(copyReset.current);
      copyReset.current = setTimeout(() => setCopiedAddress(null), 1800);
      toast.success("Receiving address copied");
    } catch {
      toast.error("Could not copy. Select the receiving address in wallet setup.");
    }
  };

  const exportCsv = () => {
    const cell = dashboardCsvCell;
    const csv = [
      ["Order", "Payment intent", "Seller", "Item", "Amount USDC", "Status", "Created", "Transaction"],
      ...visibleRows.map(row => [row.order, row.id, row.seller, row.item, formatAtomicUsdc(row.amountAtomic), row.status, row.time ? new Date(row.time).toISOString() : "", row.hash]),
    ].map(row => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `druto-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="dg-content">
      <div className="dg-page-head">
        <div><h1>Overview</h1><p>Your payments, with every detail in view.</p></div>
        <div className="dg-head-actions">
          <label className="dg-period"><Clock3 size={16} /><span className="dg-sr-only">Payment date range</span><select aria-label="Payment date range" value={period} onChange={event => setPeriod(event.target.value as Period)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option><option value="today">Today</option></select></label>
          <button className="dg-button dg-primary" onClick={onCreate}><Plus size={16} />{createLabel}</button>
        </div>
      </div>

      {error && <div className="dg-error" role="alert"><span>Payment data could not be loaded. {error.message}</span><button className="dg-text-button" onClick={() => { void intents.refetch(); void transfers.refetch(); }}>Try again</button></div>}
      <section className="dg-summary" aria-label="Payment summary" aria-busy={loading}>
        <article className="dg-metric dg-glass"><div><span>Verified payment volume</span><Wallet size={17} /></div><strong>{loading || error ? "—" : displayAmount(volume)}<small>USDC</small></strong><p>Recorded transfers to seller wallets</p></article>
        <article className="dg-metric dg-glass"><div><span>Verified payments</span><CheckCheck size={17} /></div><strong>{loading || error ? "—" : paidRows.length}</strong><p>Recorded onchain transfers</p></article>
        <article className="dg-metric dg-glass"><div><span>Open payment requests</span><Clock3 size={17} /></div><strong>{loading || error ? "—" : pendingRows.length}<small>requests</small></strong><p>{loading || error ? "Waiting for payment data" : `${displayAmount(pendingVolume)} USDC requested`}</p></article>
      </section>

      <div className="dg-workspace-grid">
        <section className="dg-panel dg-glass" aria-labelledby="dg-payments-heading">
          <div className="dg-panel-head"><div><h2 id="dg-payments-heading">Recent payments</h2><p>Order-linked payment activity</p></div><button className="dg-text-button" onClick={exportCsv} disabled={loading || !!error || !visibleRows.length}><ArrowDownToLine size={15} />Export</button></div>
          <div className="dg-table-tools">
            <FluidSurface value={filter} selector='[aria-pressed="true"]' className="dg-filters" role="group" ariaLabel="Payment status filter">{statusNames.map(status => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === "All" ? "All payments" : status}</button>)}</FluidSurface>
            <label className="dg-search"><Search size={15} /><input id="dashboard-payment-search" type="search" aria-label="Search payments" placeholder="Search payments…" value={query} onChange={event => setQuery(event.target.value)} /></label>
          </div>
          <div className="dg-table-wrap" role="region" aria-label="Recent payment records" tabIndex={0}><table><thead><tr><th scope="col">Store / order</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Date</th><th scope="col"><span className="dg-sr-only">Details</span></th></tr></thead><tbody>
            {!loading && !error && visibleRows.slice(0, 10).map(row => <tr key={row.id}>
              <td><div className="dg-payee"><span className="dg-store-avatar" aria-hidden="true">{initials(row.seller)}</span><span><strong>{row.seller}</strong><small title={row.item}>{row.order || row.id} · {row.item}</small></span></div></td>
              <td className="dg-amount">{displayAmount(row.amountAtomic)}<small>USDC</small></td>
              <td><span className="dg-status" data-status={row.status}>{row.status}</span></td>
              <td className="dg-date">{row.time ? new Date(row.time).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}</td>
              <td><button className="dg-row-open" aria-label={`View payment ${row.order || row.id}`} onClick={() => setSelectedId(row.id)}><ArrowRight size={16} /></button></td>
            </tr>)}
          </tbody></table></div>
          {loading && <div className="dg-loading" role="status"><span className="dg-skeleton" /><span className="dg-skeleton" /><span className="dg-skeleton" /><span className="dg-sr-only">Loading payment records…</span></div>}
          {!loading && !error && !visibleRows.length && <div className="dg-empty"><Wallet size={23} /><strong>{rows.length ? "No matching payments" : "Your first payment starts here"}</strong><p>{rows.length ? "Try another search, date range or status." : "Create a payment request to start your order history."}</p><button className="dg-text-button" onClick={rows.length ? () => { setQuery(""); setFilter("All"); setPeriod("all"); } : onCreate}>{rows.length ? "Clear filters" : "Create payment"}<ArrowRight size={15} /></button></div>}
          <div className="dg-table-foot"><span role="status">{loading ? "Loading payments…" : error ? "Payment records unavailable" : `Showing ${Math.min(visibleRows.length, 10)} of ${visibleRows.length} matching payments`}</span><button className="dg-text-button" onClick={() => setActive("Payments")}>View all<ArrowRight size={14} /></button></div>
        </section>

        <aside className="dg-side-stack" aria-label="Seller wallet and merchant configuration">
          <section className="dg-panel dg-glass dg-wallet-card"><div className="dg-wallet-title"><h2>Receiving wallet</h2><Wallet size={17} /></div>
            {sellers.isLoading ? <div className="dg-loading" role="status">Loading seller wallets…</div> : sellers.error ? <div className="dg-empty"><p>Wallet details could not be loaded.</p><button className="dg-text-button" onClick={() => void sellers.refetch()}>Try again</button></div> : selectedSeller ? <>
              <div className="dg-wallet-icon" aria-hidden="true"><Wallet size={24} /></div>
              {accounts.length > 1 ? <label className="dg-seller-select"><span className="dg-sr-only">Receiving seller</span><select aria-label="Receiving seller" value={selectedSeller.id} onChange={event => setSellerId(event.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.displayName}</option>)}</select></label> : <h3>{selectedSeller.displayName}</h3>}
              <p>Seller receiving destination · Arc</p><div className="dg-address"><span title={selectedSeller.receivingAddress}>{selectedSeller.receivingAddress.slice(0, 6)}…{selectedSeller.receivingAddress.slice(-5)}</span><button aria-label={copiedAddress === selectedSeller.receivingAddress ? "Receiving address copied" : "Copy receiving address"} data-copied={copiedAddress === selectedSeller.receivingAddress} onClick={() => void copyAddress()}>{copiedAddress === selectedSeller.receivingAddress ? <CheckCheck size={15} /> : <Copy size={15} />}</button></div><div className="dg-wallet-meta"><span>Ownership</span><strong data-ownership={selectedSeller.status === "disabled" ? "disabled" : selectedSeller.walletVerifiedAt ? "verified" : "pending"}>{selectedSeller.status === "disabled" ? "Disabled" : selectedSeller.walletVerifiedAt ? "Verified" : "Pending verification"}</strong></div><button className="dg-text-button" onClick={() => setActive("Sellers")}>Manage seller setup<ArrowRight size={14} /></button>
            </> : <div className="dg-empty"><Wallet size={25} /><strong>Add your receiving wallet</strong><p>Set up a seller and verify its wallet ownership.</p><button className="dg-text-button" onClick={() => setActive("Sellers")}>Set up a seller<ArrowRight size={14} /></button></div>}
          </section>
          <section className="dg-panel dg-glass dg-webhook-card"><div className="dg-wallet-title"><h2>Merchant webhooks</h2><Code2 size={17} /></div><div className="dg-hook-count">{sellers.isLoading || sellers.error ? "—" : activeWebhooks.length}<small>active endpoints</small></div><p>Configured destinations for merchant events</p><dl><div><dt>Configured</dt><dd>{sellers.isLoading || sellers.error ? "—" : webhooks.length}</dd></div><div><dt>Event signatures</dt><dd>Verify on your server</dd></div></dl><button className="dg-text-button" onClick={() => setActive("Sellers")}>Review webhook setup<ArrowRight size={14} /></button></section>
        </aside>
      </div>
      <div className="dg-lower-grid"><section className="dg-panel dg-glass dg-integration"><Code2 size={25} /><div><h2>Build with Druto</h2><p>Connect checkout, verify events, update orders.</p></div><a className="dg-text-button" href="/developers">Setup guide<ArrowRight size={15} /></a></section><section className="dg-panel dg-glass dg-latest"><h2>Latest verified payment</h2><p>{paidRows[0] ? <><span>{paidRows[0].order || paidRows[0].id}</span><strong>{displayAmount(paidRows[0].amountAtomic)} USDC</strong></> : <span>{loading ? "Loading latest payment…" : error ? "Payment records unavailable" : "Verified activity will appear here."}</span>}</p></section></div>
      <footer className="dg-footer"><span>Times shown in your device timezone</span><span>Arc Testnet · USDC</span><span>Payment evidence stays linked to the order</span></footer>

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        <DialogContent className="dashboard-payment-detail dg-payment-sheet">
          <DialogTitle>{selected?.order || selected?.id || "Payment details"}</DialogTitle>
          {selected && <><DialogDescription className="dg-detail-seller">{selected.seller} · {selected.item}</DialogDescription><div className="dg-detail-amount">{displayAmount(selected.amountAtomic)}<small>USDC</small></div><span className="dg-status" data-status={selected.status}>{selected.status}</span><dl className="dg-detail-list"><div><dt>Payment intent</dt><dd>{selected.id}</dd></div><div><dt>Receiving wallet</dt><dd>{selected.address}</dd></div><div><dt>Buyer</dt><dd>{selected.buyer || "Not provided"}</dd></div><div><dt>Transaction</dt><dd>{selected.hash || "Not submitted"}</dd></div><div><dt>Fulfillment</dt><dd>Managed by the marketplace</dd></div></dl>{selected.hash && /^0x[0-9a-fA-F]{64}$/.test(selected.hash) && <a className="dg-text-button" href={`https://testnet.arcscan.app/tx/${selected.hash}`} target="_blank" rel="noreferrer">View transaction<ExternalLink size={15} /></a>}</>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
