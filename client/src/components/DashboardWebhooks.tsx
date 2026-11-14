import { useEffect, useState } from "react";
import { CheckCheck, Copy, RefreshCw, Search, Webhook, ShieldCheck, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import FluidSurface from "@/components/FluidSurface";
import { toast } from "sonner";
import "@/styles/dashboard-webhooks.css";

const statusLabel = (status: string) => status === "succeeded" ? "Delivered" : status === "failed" ? "Failed" : "Awaiting delivery";
const badge = (status: string) => status === "succeeded" ? "Verified" : status === "failed" ? "Failed" : "Pending";
const date = (value: Date | string | null) => value ? new Date(value).toLocaleString() : "Not recorded";

export default function DashboardWebhooks({ onSetup, readOnly = false }: { onSetup: () => void; readOnly?: boolean }) {
  const [endpointId, setEndpointId] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim().slice(0, 120)), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(null), 1800); return () => clearTimeout(timer); }, [copied]);
  const accounts = trpc.merchantAccounts.listMine.useQuery(undefined, { refetchOnWindowFocus: false });
  const query = trpc.merchantAccounts.webhookConsole.useInfiniteQuery({
    limit: 25, endpointId: endpointId || undefined, status: filter === "all" ? undefined : filter as "pending" | "succeeded" | "failed", search: term || undefined,
  }, { getNextPageParam: last => last.nextCursor ?? undefined, refetchInterval: 15000, refetchOnWindowFocus: false });
  const detail = trpc.merchantAccounts.webhookDelivery.useQuery({ deliveryId: selected ?? "" }, { enabled: !!selected, refetchInterval: selected ? 15000 : false });
  const retry = trpc.merchantAccounts.retryWebhook.useMutation();
  const utils = trpc.useUtils();
  const endpoints = accounts.data?.webhooks ?? [];
  const rows = query.data?.pages.flatMap(page => page.items) ?? [];
  const counts = query.data?.pages[0]?.counts;
  const record = detail.data;
  const copy = async (value: string, id: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(id); }
    catch { toast.error("Copy unavailable. Select the text and copy it manually."); }
  };
  const resend = async () => {
    if (!record || readOnly || !confirmed || !record.retryAvailable) return;
    try {
      const result = await retry.mutateAsync({ deliveryId: record.id });
      if (result.skipped) toast.info("No event sent. It may already be delivered, not due, or in progress. Refresh the delivery.");
      else if (result.ok) toast.success("Endpoint acknowledged the event. Order fulfillment remains the marketplace's responsibility.");
      else toast.error("Delivery was not acknowledged. Review the endpoint and retry schedule.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Delivery retry failed"); }
    finally {
      setConfirmed(false);
      await Promise.all([utils.merchantAccounts.webhookConsole.invalidate(), utils.merchantAccounts.webhookDelivery.invalidate()]);
    }
  };
  return <div className="dg-content wh-console">
    <div className="dg-page-head"><div><h1>Webhooks</h1><p>The bridge between payment evidence and order updates.</p></div><button className="dg-button" disabled={query.isFetching} onClick={() => void Promise.all([query.refetch(), accounts.refetch()])}><RefreshCw size={15} />{query.isFetching ? "Refreshing…" : "Refresh"}</button></div>
    <div className="wh-signing"><ShieldCheck size={18} /><p><strong>Signature verification is required.</strong> Verify the raw body on your storefront server and deduplicate by event ID. HTTP acknowledgement does not confirm fulfillment.</p><a href="/developers#webhooks">Verification guide <ArrowRight size={14} /></a></div>
    {readOnly && <p className="wh-notice">Development preview · sample events only. Retry is disabled; no requests reach a storefront.</p>}
    <section className="dg-summary" aria-label="Webhook totals">
      {[["Delivered", counts?.delivered, "Endpoint acknowledged"], ["Awaiting delivery", counts?.pending, "Queued or currently processing"], ["Failed", counts?.failed, "Retry scheduled or review required"]].map(([label, count, note]) => <article className="dg-metric dg-glass" key={String(label)}><div>{label}<Webhook size={17} /></div><strong>{query.error || count === undefined ? "—" : count}</strong><p>{note}</p></article>)}
    </section>
    <section className="dg-panel dg-glass wh-endpoints"><div className="dg-panel-head"><div><h2>Storefront endpoints</h2><p>Totals cover all events for the selected endpoint, independently of log filters.</p></div><button className="dg-text-button" onClick={onSetup}>Seller setup <ArrowRight size={14} /></button></div>
      <div className="wh-endpoint-body"><label className="wh-endpoint-select">Delivery destination<select value={endpointId} onChange={event => setEndpointId(event.target.value)}><option value="">All your endpoints</option>{endpoints.map(endpoint => <option key={endpoint.id} value={endpoint.id}>{accounts.data?.accounts.find(account => account.id === endpoint.merchantAccountId)?.displayName ?? endpoint.id} · {endpoint.active ? "Active" : "Paused"}</option>)}</select></label>
      {accounts.isLoading ? <p role="status">Loading endpoints…</p> : accounts.error ? <div role="alert" className="dg-error">Endpoints could not be loaded.<button className="dg-text-button" onClick={() => void accounts.refetch()}>Try again</button></div> : !endpoints.length ? <div className="dg-empty"><Webhook size={22} /><strong>No endpoint configured</strong><p>Add a registered HTTPS destination through seller setup. Its origin must be enabled by the operator.</p><button className="dg-text-button" onClick={onSetup}>Open seller setup <ArrowRight size={14} /></button></div> : endpoints.filter(endpoint => !endpointId || endpoint.id === endpointId).map(endpoint => <div className="wh-endpoint" key={endpoint.id}><div><strong>{accounts.data?.accounts.find(account => account.id === endpoint.merchantAccountId)?.displayName ?? "Seller"}</strong><code>{endpoint.url}</code><small>{endpoint.active ? "Active" : "Paused"} · {endpoint.id}</small></div><button className="dg-text-button" onClick={() => void copy(endpoint.url, endpoint.id)}>{copied === endpoint.id ? <CheckCheck size={15} /> : <Copy size={15} />}{copied === endpoint.id ? "Copied" : "Copy endpoint"}</button></div>)}
      </div></section>
    <section className="dg-panel dg-glass wh-log"><div className="dg-panel-head"><div><h2>Delivery log</h2><p>Persistent event records · times in your device timezone</p></div><label className="dg-search"><Search size={15} /><span className="dg-sr-only">Search delivery events</span><input type="search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} placeholder="Order or event ID…" /></label></div>
      <div className="wh-log-filters"><FluidSurface value={filter} selector='[aria-pressed="true"]' className="dg-filters" role="group" ariaLabel="Delivery status">{[["all","All events"],["succeeded","Delivered"],["pending","Awaiting"],["failed","Failed"]].map(([value,label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</FluidSurface></div>
      {query.error && <div className="dg-error" role="alert">Delivery records could not be refreshed{rows.length ? "; loaded records may be stale." : "."}<button className="dg-text-button" onClick={() => void query.refetch()}>Try again</button></div>}
      {query.isLoading ? <div className="dg-loading" role="status">Loading delivery records…</div> : !rows.length && !query.error ? <div className="dg-empty"><Webhook size={24} /><strong>{term || filter !== "all" ? "No matching deliveries" : "No events yet"}</strong><p>{term || filter !== "all" ? "Try another reference or clear the log filters." : "An event is queued after a payment is verified for a configured active endpoint."}</p>{(term || filter !== "all") && <button className="dg-text-button" onClick={() => {setSearch("");setFilter("all");}}>Clear filters</button>}</div> : <div className="dg-table-wrap"><table><thead><tr><th scope="col">Order / event</th><th scope="col">Delivery</th><th scope="col">Attempts</th><th scope="col">Next attempt / lease</th><th scope="col">Action</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><div className="dg-payee"><div><strong>{row.externalOrderId ?? row.paymentIntentId}</strong><small>{row.eventId}</small><small>{row.eventType} · {row.sellerName}</small></div></div></td><td data-label="Delivery"><span className="dg-status" data-status={badge(row.status)}>{statusLabel(row.status)}</span>{!row.endpointActive && <small className="wh-paused">Endpoint paused</small>}</td><td data-label="Attempts">{row.attempts}</td><td className="dg-date" data-label="Next attempt / lease">{date(row.nextAttemptAt)}</td><td><button className="dg-text-button" onClick={() => {setSelected(row.id);setConfirmed(false);}}>View details <ArrowRight size={14} /></button></td></tr>)}</tbody></table></div>}
      <div className="dg-table-foot"><span role="status">{rows.length} loaded deliveries{query.isFetching && !query.isLoading ? " · refreshing…" : ""}</span>{query.hasNextPage && <button className="dg-text-button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : "Load more"}</button>}</div>
    </section>
    <footer className="dg-footer"><span>Arc Testnet · payment.verified</span><span>Same event ID on retry · no new payment or refund</span></footer>
    <Dialog open={!!selected} onOpenChange={open => {if (!open) {setSelected(null);setConfirmed(false);}}}>
      <DialogContent className="dashboard-payment-detail dg-payment-sheet wh-detail"><DialogTitle>Delivery details</DialogTitle><DialogDescription className="dg-detail-seller">Inspect the stored event and its delivery state before retrying.</DialogDescription>
        {detail.isLoading ? <p role="status">Loading delivery…</p> : detail.error ? <div role="alert" className="dg-error">Delivery details unavailable.<button className="dg-text-button" onClick={() => void detail.refetch()}>Try again</button></div> : record && <>
          <span className="dg-status wh-detail-status" data-status={badge(record.status)}>{statusLabel(record.status)}</span>
          <dl className="dg-detail-list">{[["Event ID",record.eventId],["Payment intent",record.paymentIntentId],["Order",record.externalOrderId ?? "Not recorded"],["Attempts",record.attempts],["Created",date(record.createdAt)],["Last state update",date(record.updatedAt)],["Acknowledged",date(record.deliveredAt)],["Next attempt / lease",date(record.nextAttemptAt)],["Last HTTP response","Not retained by this release"]].map(([key,value]) => <div key={String(key)}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          <div className="wh-payload-head"><h3>Redacted payload</h3>{record.payload && <button className="dg-text-button" onClick={() => void copy(JSON.stringify(record.payload,null,2),"payload")}>{copied === "payload" ? "Copied" : "Copy JSON"}</button>}</div>
          <p className="wh-caption">Stored event fields only. Buyer contact, order context, signatures and secrets are omitted; this is not the raw signed body.</p><pre className="wh-payload">{record.payload ? JSON.stringify(record.payload,null,2) : "Stored payload unavailable or invalid."}</pre>
          {record.status !== "succeeded" && <div className="wh-retry"><p>Retry sends the same event to its registered endpoint. Your receiver must handle duplicates safely.</p>{readOnly ? <p>Retry is unavailable in this read-only preview.</p> : record.retryAvailable ? <><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I have checked the receiver and understand this may repeat an order update.</label><button type="button" className="dg-button dg-primary" disabled={!confirmed || retry.isPending} onClick={() => void resend()}><RefreshCw size={15} />{retry.isPending ? "Sending…" : "Retry delivery"}</button></> : <p>{!record.endpointActive ? "Endpoint is paused. No retry can be sent." : "Not due or currently processing. Refresh after the scheduled time."}</p>}</div>}
          {record.status === "succeeded" && <p className="wh-notice">Already acknowledged. Retry is disabled; delivery acknowledgement does not mean shipped or delivered.</p>}
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}