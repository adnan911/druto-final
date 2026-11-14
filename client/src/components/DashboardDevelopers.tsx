import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, Circle, Copy, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { integrationChecklist } from "@/lib/integrationChecklist";
import { developerSdkSnippet } from "@/lib/developer";
import sdkPackage from "../../../sdk/druto-sdk/package.json";
import starterPackage from "../../../starter-templates/cloudflare/package.json";
import { toast } from "sonner";
import "@/styles/dashboard-developers.css";

export default function DashboardDevelopers({ onNavigate, readOnly = false }: { onNavigate:(section:string)=>void; readOnly?:boolean }) {
  const [sellerId,setSellerId]=useState("");
  const [endpointId,setEndpointId]=useState("");
  const [copied,setCopied]=useState<string|null>(null);
  const accounts=trpc.merchantAccounts.listMine.useQuery(undefined,{refetchOnWindowFocus:false});
  const keys=trpc.apiKeys.list.useQuery(undefined,{refetchOnWindowFocus:false});
  const intents=trpc.payments.listIntents.useQuery(undefined,{refetchOnWindowFocus:false});
  const transfers=trpc.payments.verifiedPayments.useQuery(undefined,{refetchOnWindowFocus:false});
  const seller=sellerId ? accounts.data?.accounts.find(row=>row.id===sellerId) : accounts.data?.accounts[0];
  const endpoints=(accounts.data?.webhooks ?? []).filter(row=>row.merchantAccountId===seller?.id && row.active===1);
  const endpoint=endpointId ? endpoints.find(row=>row.id===endpointId) : endpoints[0];
  const deliveries=trpc.merchantAccounts.webhookConsole.useQuery({endpointId:endpoint?.id,limit:1},{enabled:!!endpoint,refetchOnWindowFocus:false});
  const steps=integrationChecklist({
    account:seller,keys:keys.data??[],endpoints:accounts.data?.webhooks??[],intents:intents.data??[],transfers:transfers.data??[],
    endpointId:endpoint?.id,delivered:deliveries.data?.counts.delivered,
    known:{accounts:accounts.isSuccess&&!accounts.isError,keys:keys.isSuccess&&!keys.isError,
      payments:intents.isSuccess&&!intents.isError&&transfers.isSuccess&&!transfers.isError,
      deliveries:deliveries.isSuccess&&!deliveries.isError},
  });
  const complete=steps.filter(step=>step.state==="complete").length;
  const fetching=accounts.isFetching||keys.isFetching||intents.isFetching||transfers.isFetching||deliveries.isFetching;
  const errors=accounts.isError||keys.isError||intents.isError||transfers.isError||(!!endpoint&&deliveries.isError);
  const updated=[accounts.dataUpdatedAt,keys.dataUpdatedAt,intents.dataUpdatedAt,transfers.dataUpdatedAt,...(endpoint?[deliveries.dataUpdatedAt]:[])].filter(Boolean);
  const sdkZip="/downloads/druto-sdk-"+sdkPackage.version+".zip";
  const starterZip="/downloads/druto-cloudflare-starter-"+starterPackage.version+".zip";
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(null),1800);return()=>clearTimeout(timer);},[copied]);
  const copy=async(value:string,id:string)=>{try{await navigator.clipboard.writeText(value);setCopied(id);}catch{toast.error("Copy unavailable. Select and copy the text manually.");}};
  const refresh=()=>Promise.all([accounts.refetch(),keys.refetch(),intents.refetch(),transfers.refetch(),...(endpoint?[deliveries.refetch()]:[])]);
  return <div className="dg-content di-console">
    <div className="dg-page-head"><div><h1>Developer hub</h1><p>Connect your storefront, then inspect the evidence.</p></div><a className="dg-button" href="/developers">Full documentation <ArrowRight size={15}/></a></div>
    <div className="di-scope"><ShieldCheck size={19}/><p>Arc Testnet USDC · one seller per payment · 0% platform fee. These setup signals do not certify production readiness, compliance or order fulfillment.</p></div>
    {readOnly&&<p className="di-notice">Development preview · checklist reflects isolated sample records, not your account or a live integration.</p>}
    <section className="dg-panel dg-glass di-checklist" aria-label="Seller integration checklist">
      <div className="dg-panel-head"><div><h2>Integration checklist</h2><p role="status">{complete} of {steps.length} setup signals observed{fetching?" · refreshing…":""}</p></div><button type="button" className="dg-text-button" disabled={fetching} onClick={()=>void refresh()}><RefreshCw size={15}/>Refresh evidence</button></div>
      <div className="di-selectors"><label>Seller workspace<select value={seller?.id??""} disabled={accounts.isLoading||accounts.isError} onChange={event=>{setSellerId(event.target.value);setEndpointId("");}}><option value="" disabled>Select a seller</option>{accounts.data?.accounts.map(row=><option key={row.id} value={row.id}>{row.displayName} · {row.marketplaceId} / {row.externalSellerId}</option>)}</select></label><label>Active webhook endpoint<select value={endpoint?.id??""} disabled={!endpoints.length||accounts.isError} onChange={event=>setEndpointId(event.target.value)}><option value="" disabled>No active endpoint</option>{endpoints.map(row=><option key={row.id} value={row.id}>{row.url}</option>)}</select></label></div>
      {errors&&<div className="dg-error" role="alert">Some evidence could not be refreshed. Affected steps are unknown; do not treat loaded records as a completed setup.<button className="dg-text-button" onClick={()=>void refresh()}>Try again</button></div>}
      {!accounts.isLoading&&!accounts.isError&&!accounts.data?.accounts.length&&<p className="di-context">No seller registered yet. Start with seller setup; other steps will remain blocked until verification.</p>}
      {seller&&<p className="di-context"><strong>{seller.displayName}</strong><span>{seller.id}</span><span>Receiving wallet: {seller.receivingAddress}</span></p>}
      <ol className="di-steps">{steps.map(step=><li key={step.id} data-state={step.state}><span className="di-step-icon" aria-hidden="true">{step.state==="complete"?<Check size={17}/>:step.state==="unknown"?<AlertCircle size={17}/>:<Circle size={17}/>}</span><div><div className="di-step-title"><h3>{step.title}</h3><span>{step.state==="complete"?"Observed":step.state==="unknown"?"Unknown":step.state==="blocked"?"Prerequisite needed":"Action needed"}</span></div><p>{step.state==="unknown"?"Evidence is loading or unavailable. Refresh before drawing a conclusion.":step.detail}</p></div><button type="button" className="dg-text-button" onClick={()=>onNavigate(step.target)}>{step.action}<ArrowRight size={14}/></button></li>)}</ol>
      <div className="di-checklist-foot"><span>Oldest loaded evidence: {updated.length?new Date(Math.min(...updated)).toLocaleString():"Not loaded"}</span><a href="/developers/start">Open complete setup guide <ArrowRight size={14}/></a></div>
    </section>
    <div className="di-resources"><section className="dg-panel dg-glass di-package"><h2>Use your existing storefront</h2><p>Install the downloadable server SDK. Keep pricing, order authorization and credentials in your backend.</p><dl><div><dt>Package</dt><dd>@druto/sdk</dd></div><div><dt>Version</dt><dd>{sdkPackage.version}</dd></div><div><dt>Distribution</dt><dd>ZIP · not npm-published</dd></div></dl><div className="di-downloads"><a className="dg-button dg-primary" href={sdkZip} download><ArrowDownToLine size={15}/>Download SDK</a><a className="dg-text-button" href={sdkZip+".sha256"} download>SHA-256 checksum</a></div><div className="di-install"><code>npm install ./druto-sdk</code><button className="icon-button" aria-label="Copy SDK install command" onClick={()=>void copy("npm install ./druto-sdk","install")}>{copied==="install"?<CheckCheck size={15}/>:<Copy size={15}/>}</button></div></section>
    <section className="dg-panel dg-glass di-package"><h2>Start on Cloudflare</h2><p>Adapt the standalone storefront with its own D1 order database and signed webhook receiver.</p><dl><div><dt>Starter version</dt><dd>{starterPackage.version}</dd></div><div><dt>Database</dt><dd>Separate storefront D1</dd></div><div><dt>Fulfillment</dt><dd>Your worker is required</dd></div></dl><div className="di-downloads"><a className="dg-button" href={starterZip} download><ArrowDownToLine size={15}/>Download starter</a><a className="dg-text-button" href={starterZip+".sha256"} download>SHA-256 checksum</a></div><a className="dg-text-button" href="/starter-preview/">Preview storefront <ArrowRight size={14}/></a></section></div>
    <section className="dg-panel dg-glass di-quickstart"><div className="dg-panel-head"><div><h2>Server quickstart</h2><p>Integration fragment, not a complete application. Implement durable order binding.</p></div><button className="dg-text-button" onClick={()=>void copy(developerSdkSnippet,"snippet")}>{copied==="snippet"?<CheckCheck size={15}/>:<Copy size={15}/>} {copied==="snippet"?"Copied":"Copy example"}</button></div><pre><code>{developerSdkSnippet}</code></pre></section>
    <section className="di-manual"><h2>Checks your storefront must prove</h2><p>Druto cannot infer these from an HTTP 2xx. Verify the raw-body signature and event version, match the stored order/intent/seller/recipient/atomic amount, and atomically deduplicate the event before queuing fulfillment.</p><div><a className="dg-text-button" href="/developers#webhooks">Webhook verification guide <ArrowRight size={14}/></a><a className="dg-text-button" href="/developers/start">Run the end-to-end checklist <ArrowRight size={14}/></a></div></section>
  </div>;
}