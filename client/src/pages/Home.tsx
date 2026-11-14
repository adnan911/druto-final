// Ledger Light reminder: editorial Swiss structure, warm white surfaces, graphite text, cobalt actions, Druto Sea Glass finality, IBM Plex Mono for identifiers, and restrained motion.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { getDashboardDateRangeStart, isWithinDashboardDateRange, type DashboardDateRange } from "@/lib/dashboardFilters";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { Link, useLocation } from "wouter";
import { buildMarketplaceCheckoutPayload, calculateMarketplaceTotals, getNextMarketplaceCheckout, parseMarketplaceOrderContext, prepareMarketplaceSellerPayments, MarketplacePaymentQueueError, splitMarketplaceCartBySeller, updateMarketplaceQuantity, type MarketplaceCartLine, type MarketplacePaymentQueue } from "@/lib/marketplace";
import { developerSdkSnippet } from "@/lib/developer";
import AccountLoginCard from "@/components/AccountLoginCard";
import DashboardOverview from "@/components/DashboardOverview";
import DashboardWallets from "@/components/DashboardWallets";
import DashboardWebhooks from "@/components/DashboardWebhooks";
import DashboardDevelopers from "@/components/DashboardDevelopers";
import FluidSurface from "@/components/FluidSurface";
import { useDashboardTheme } from "@/lib/dashboardTheme";
import "@/styles/dashboard-theme.css";
import ApiKeyManager from "@/components/ApiKeyManager";
import SellerOnboarding from "@/components/SellerOnboarding";
import WalletConnectButton from "@/components/WalletConnectButton";
import { buildReceiptSummary, copyReceiptValue, truncateHash } from "@/lib/receipt";
import { safeMarketplaceReturnUrl } from "@/lib/checkoutLinks";
import { dashboardAccessState } from "@/lib/access";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ARC_CHAIN_ID, ARC_CHAIN_ID_HEX, ARC_RPC_URL, ARC_TESTNET_EXPLORER_URL, ARC_USDC_ADDRESS, CIRCLE_FAUCET_URL, fetchArcUsdcBalance, encodeArcUsdcTransfer } from "@/lib/arcChain";
import { toast } from "sonner";
import { signPaymentConfirmation } from "@/lib/paymentProof";
import { checkoutWalletError } from "@/lib/walletError";
import QRCode from "qrcode";
const DevDashboardPreview = import.meta.env.DEV ? lazy(() => import("@/dev/DashboardPreview")) : null;
const D1_WALLET_ONLY = import.meta.env.VITE_D1_WALLET_ONLY === "true";
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell, BookOpen, Box, Check, ChevronDown, ChevronUp, CircleDollarSign, Clipboard, Code2, Copy, CreditCard, Database, ExternalLink, FileText, Gauge, HelpCircle, Home as HomeIcon, KeyRound, Layers, LayoutGrid, LifeBuoy, Link2, LockKeyhole, LogOut, Mail, MapPin, Menu, Moon, Sun, MoreHorizontal, PauseCircle, Plus, Printer, ReceiptText, RefreshCw, Rocket, Search, Send, Settings2, ShieldCheck, Sparkles, Table2, Timer, TrendingUp, UserRound, UsersRound, Wallet, WalletCards, X, Zap
} from "lucide-react";

const logo = "/DRUTO_D_logo.svg";
const logoFull = "/druto_logo_full.png";
const heroVisual = "/manus-storage/druto-editorial-network_c7fbc025.jpg";
const flowVisual = "/manus-storage/druto-payment-flow_17da128c.jpg";
const settleVisual = "/manus-storage/druto-settlement-abstract_ac9457d1.jpg";
type VerifiedPaymentRow = inferRouterOutputs<AppRouter>["payments"]["verifiedPaymentsPage"]["items"][number];

export interface ModuleToggles {
  paymentLinks: boolean;
  invoices: boolean;
  subscriptions: boolean;
  reports: boolean;
}

const DEFAULT_MODULE_TOGGLES: ModuleToggles = {
  paymentLinks: false,
  invoices: false,
  subscriptions: false,
  reports: false,
};

function getStoredModuleToggles(): ModuleToggles {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("druto_module_toggles") : null;
    if (raw) return { ...DEFAULT_MODULE_TOGGLES, ...JSON.parse(raw) };
  } catch (e) {
    console.error("Error loading module toggles", e);
  }
  return DEFAULT_MODULE_TOGGLES;
}

function saveStoredModuleToggles(toggles: ModuleToggles) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem("druto_module_toggles", JSON.stringify(toggles));
    }
  } catch (e) {
    console.error("Error saving module toggles", e);
  }
}

function classNames(...values: Array<string | false | undefined>) { return values.filter(Boolean).join(" "); }

function StatusPill({ status, tone = "neutral", verified = false, txHash }: { status: string; tone?: string; verified?: boolean; txHash?: string }) {
  const isSuccess = tone === "success" || status.toLowerCase() === "succeeded" || verified;
  const icon = isSuccess ? <Check size={12} strokeWidth={3} /> : tone === "warning" ? <Timer size={12} /> : tone === "danger" ? <AlertTriangle size={12} /> : <Activity size={12} />;
  
  return (
    <span className={classNames("status-pill", isSuccess ? "status-success" : `status-${tone}`)} title={isSuccess ? "Verified on Arc Testnet via ArcScan" : undefined}>
      {icon}
      {status}
      {isSuccess && (
        <span style={{ display: "inline-flex", alignItems: "center", marginLeft: "2px", opacity: 0.9 }}>
          <ShieldCheck size={12} />
        </span>
      )}
    </span>
  );
}

function Mark({ full = false }: { full?: boolean }) {
  return <img src={full ? logoFull : logo} alt="Druto" className={full ? "brand-logo-full" : "brand-mark"} />;
}

function ProfileEditModal({ user, onClose }: { user: { name?: string | null; profileImage?: string | null }; onClose: () => void }) {
  const [name, setName] = useState(user.name || "");
  const [profileImage, setProfileImage] = useState(user.profileImage || "");
  const updateProfile = trpc.auth.updateProfile.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync({ name, profileImage });
      await utils.auth.me.invalidate();
      toast.success("Profile updated!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined} className="dashboard-payment-detail max-h-[90dvh] overflow-y-auto sm:max-w-[400px]">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <DialogTitle>Edit Profile</DialogTitle>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label htmlFor="profile-name" style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-secondary)" }}>Name</label>
            <input id="profile-name" type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-subtle, #d3e1d8)" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-secondary)" }} htmlFor="profile-image">Profile Image URL</label>
            <input id="profile-image" type="url" value={profileImage} onChange={e => setProfileImage(e.target.value)} placeholder="https://example.com/avatar.png" style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-subtle, #d3e1d8)" }} />
          </div>
          <button type="submit" className="button button-primary" disabled={updateProfile.isPending} style={{ marginTop: "8px", justifyContent: "center" }}>
            {updateProfile.isPending ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Sidebar({ active, setActive, collapsed, setCollapsed, user, moduleToggles, onExitPreview, mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void; onExitPreview?: () => void; active: string; setActive: (value: string) => void; collapsed: boolean; setCollapsed: (value: boolean) => void; user: { name?: string | null; openId?: string | null; profileImage?: string | null }; moduleToggles: ModuleToggles }) {
  const drutoLogout = trpc.auth.logout.useMutation();
  const utils = trpc.useUtils();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const navGroups = [
    { label: "Workspace", items: ["Overview", "Payments", "Sellers"] },
    { label: "Manage", items: ["Receiving wallets", "Developers", "API Keys", "Webhooks", "Settings"] },
  ];
  const logout = async () => {
    if (onExitPreview) return onExitPreview();
    try {
      await drutoLogout.mutateAsync();
      utils.auth.me.setData(undefined, null);
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out");
    }
  };
  return <aside id="druto-dashboard-sidebar" aria-label="Main navigation" className={classNames("sidebar", collapsed && "sidebar-collapsed", mobileOpen && "dashboard-mobile-open")}>
    <div className="brand-row">
      <div className="brand-lockup">
        <Mark /><span className="dg-brand-name">Druto</span>
      </div>
      <button className="icon-button sidebar-toggle" onClick={() => mobileOpen ? onCloseMobile?.() : setCollapsed(!collapsed)} aria-label={mobileOpen ? "Close navigation" : "Toggle navigation"}>
        {mobileOpen ? <X size={17} /> : <Menu size={17} />}
      </button>
    </div>
    <div className="environment-switch"><span className="dg-workspace-avatar">DR</span><span className="dg-workspace-copy"><strong>{onExitPreview ? "Demo workspace" : user.name || "My workspace"}</strong><small>Arc Testnet · USDC</small></span></div>
    <nav className="side-nav"><FluidSurface value={active} selector='[aria-current="page"]' className="dg-fluid-navigation">{navGroups.map(group => <div key={group.label} className="nav-group"><div className="nav-label">{group.label}</div>{group.items.map(item => <button key={item} onClick={() => setActive(item)} aria-current={active === item ? "page" : undefined} className={classNames("nav-item", active === item && "nav-active")}><NavIcon item={item} /><span>{item}</span></button>)}</div>)}</FluidSurface></nav>
    <div className="sidebar-bottom">
      <button className={classNames("nav-item", active === "Support" && "nav-active")} onClick={() => setActive("Support")}><LifeBuoy size={17} /><span>Support & Guides</span></button>
      <div className={classNames("profile-wrap", profileOpen && "profile-open")}>
        <button className="user-card" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} aria-label="Open profile menu">
          <div className="avatar" style={{ overflow: "hidden" }}>
            {user.profileImage ? <img src={user.profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (user.name?.slice(0, 2).toUpperCase() || "DR")}
          </div>
          <div className="user-meta">
            <strong>{user.name || "Workspace"}</strong>
            <span>{onExitPreview ? "Sample account" : "Signed-in account"}</span>
          </div>
          <MoreHorizontal size={16} />
        </button>
        {profileOpen && <div className="profile-menu">
          <button className="profile-logout" onClick={() => { setEditModalOpen(true); setProfileOpen(false); }} style={{ borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", marginBottom: "0.25rem", borderRadius: "0", color: "inherit" }}>
            <Settings2 size={15} /> Edit Profile
          </button>
          <button className="profile-logout" onClick={() => void logout()} disabled={drutoLogout.isPending}>
            <LogOut size={15} />{onExitPreview ? "Exit preview" : drutoLogout.isPending ? "Logging out…" : "Sign out"}
          </button>
        </div>}
      </div>
    </div>
    {editModalOpen && <ProfileEditModal user={user} onClose={() => setEditModalOpen(false)} />}
  </aside>;
}

function NavIcon({ item }: { item: string }) {
  const icons: Record<string, any> = { Overview: LayoutGrid, Payments: CreditCard, Sellers: UsersRound, "Receiving wallets": WalletCards, "Payment Links": Link2, Invoices: ReceiptText, Subscriptions: RefreshCw, Customers: UsersRound, "Seller transfers": WalletCards, "Direct settlement": Send, Reports: Table2, "Risk controls & limitations": ShieldCheck, Webhooks: Activity, Developers: Code2, "API Keys": KeyRound, Settings: Settings2 };
  const Icon = icons[item] || Box; return <Icon size={17} />;
}

function Topbar({ title, onCreate, onExitPreview, overview, onSearch, onOpenNavigation, theme, onToggleTheme }: {
  title: string; onCreate: () => void; onExitPreview?: () => void; overview?: boolean; onSearch: () => void; onOpenNavigation: () => void; theme: "light" | "dark"; onToggleTheme: () => void;
}) {
  const logout = trpc.auth.logout.useMutation();
  const utils = trpc.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([utils.payments.listIntents.invalidate(), utils.payments.verifiedPayments.invalidate(), utils.payments.verifiedPaymentsPage.invalidate(), utils.payments.summary.invalidate(), utils.merchantAccounts.listMine.invalidate(), utils.merchantAccounts.webhookConsole.invalidate()]);
    } finally { setRefreshing(false); }
  };
  const disconnect = async () => {
    if (onExitPreview) return onExitPreview();
    try {
      await logout.mutateAsync();
      utils.auth.me.setData(undefined, null);
      window.location.href = "/dashboard";
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not sign out. Try again."); }
  };
  return <header className="topbar">
    <div className="topbar-title">
      <button type="button" className="icon-button dg-mobile-menu" aria-label="Open navigation" aria-controls="druto-dashboard-sidebar" onClick={onOpenNavigation}><Menu size={18} /></button>
      <div className="breadcrumb">Workspace <span>/</span> <strong>{title}</strong></div>
      {!overview && title !== "Webhooks" && title !== "API Keys" && title !== "Developers" && <h1>{title}</h1>}
    </div>
    <div className="topbar-actions">
      <span className="dg-environment">{onExitPreview ? "Demo workspace" : "Arc Testnet"}</span>
      <button type="button" className="icon-button dg-theme-toggle" onClick={onToggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
        {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
      </button>
      <button className="dg-header-search" onClick={onSearch}><Search size={15} />Search payments<kbd>Ctrl K</kbd></button>
      <button type="button" className="icon-button" aria-label="Refresh dashboard" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} /></button>
      <button className="button button-quiet" onClick={() => void disconnect()} disabled={logout.isPending}>{onExitPreview ? "Exit preview" : logout.isPending ? "Signing out…" : "Sign out"}</button>
    </div>
  </header>;
}

function Metric({ label, value, delta, positive, icon }: { label: string; value: string; delta: string; positive?: boolean; icon?: React.ReactNode }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span></div><strong>{value}</strong><div className={classNames("metric-delta", positive && "positive")}>{positive && <ArrowUpRight size={13} />}{delta}</div></div>; }
function FlowStep({ n, label, value, done }: { n: string; label: string; value: string; done?: boolean }) { return <div className="flow-step"><span className={classNames("flow-number", done && "flow-done")}>{done ? <Check size={12} /> : n}</span><span><strong>{label}</strong><small>{value}</small></span></div>; }
function QueueItem({ icon, title, detail, action, tone, onAction }: { icon: React.ReactNode; title: string; detail: string; action: string; tone: string; onAction: () => void }) { return <div className="queue-item"><span className={classNames("queue-icon", `queue-${tone}`)}>{icon}</span><span className="queue-copy"><strong>{title}</strong><small>{detail}</small></span><button className="small-link" onClick={onAction}>{action}</button></div>; }

function PaymentTable({ compact = false, useExternalData = false, rows: suppliedRows, loading: suppliedLoading, error: suppliedError, onRetry }: { compact?: boolean; useExternalData?: boolean; rows?: VerifiedPaymentRow[]; loading?: boolean; error?: unknown; onRetry?: () => void }) {
  const ownQuery = trpc.payments.verifiedPaymentsPage.useQuery({ limit: compact ? 4 : 25 }, { enabled: !useExternalData });
  const rows = suppliedRows ?? ownQuery.data?.items ?? [];
  const loading = suppliedLoading ?? ownQuery.isLoading;
  const error = suppliedError ?? ownQuery.error;
  const retry = onRetry ?? (() => void ownQuery.refetch());
  const visibleRows = compact ? rows.slice(0, 4) : rows;

  if (error && rows.length === 0) return <div className="dashboard-data-message is-error" role="alert"><span>Verified payments could not be loaded.</span><button className="small-link" onClick={retry}>Try again</button></div>;
  if (loading && rows.length === 0) return <div className="dashboard-data-message" role="status">Loading verified payments…</div>;
  if (!loading && !error && rows.length === 0) return <div className="history-empty"><div className="empty-icon"><Search size={19} /></div><h3>No verified Arc transfers yet</h3><p>Complete an Arc Testnet USDC checkout to see its verified transfer here.</p></div>;

  return <div className="table-wrap">{error && <div className="dashboard-data-message is-error" role="alert"><span>Showing saved data. Refresh failed.</span><button className="small-link" onClick={retry}>Retry</button></div>}<table><thead><tr><th>Payment</th><th>Buyer / item</th><th>Amount</th><th>Status</th><th>Received</th></tr></thead><tbody>{visibleRows.map(row => {
    const created = new Date(row.finalizedAt ?? row.createdAt);
    const buyer = row.buyerLabel || (row.fromAddress ? `${row.fromAddress.slice(0, 8)}…${row.fromAddress.slice(-6)}` : "Wallet buyer");
    return <tr key={row.paymentIntentId}><td><span className="mono-id">{row.paymentIntentId}</span><small className="table-sub"><span className="mini-arc" />{row.transactionHash}</small></td><td><div className="buyer-item-cell"><span>{buyer}</span><small>{row.itemName || "—"}</small></div></td><td className="amount-cell">${(Number(row.amountAtomic) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2 })}<small>USDC</small></td><td><StatusPill status="Verified" tone="success" verified txHash={row.transactionHash} /></td><td className="muted-cell">{Number.isFinite(created.getTime()) ? created.toLocaleString() : "—"}</td></tr>;
  })}</tbody></table></div>;
}

function TransactionHistory() {
  const [dateRange, setDateRange] = useState<DashboardDateRange>("All dates");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const fromTimestamp = useMemo(() => getDashboardDateRangeStart(dateRange), [dateRange]);
  const liveQuery = trpc.payments.verifiedPaymentsPage.useInfiniteQuery(
    { limit: 25, fromTimestamp, search: searchQuery || undefined },
    { getNextPageParam: lastPage => lastPage.nextCursor ?? undefined },
  );
  const liveRows = liveQuery.data?.pages.flatMap(page => page.items) ?? [];
  const rows = liveRows.map(row => {
    const rawCreatedAt = row.finalizedAt ?? row.createdAt;
    const created = rawCreatedAt instanceof Date ? rawCreatedAt : new Date(rawCreatedAt);
    const timestamp = created.getTime();
    const buyer = row.buyerLabel || (row.fromAddress ? `${row.fromAddress.slice(0, 8)}…${row.fromAddress.slice(-6)}` : "Wallet buyer");
    return { id: row.paymentIntentId, dbId: row.id, date: created.toLocaleDateString(), time: created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), timestamp, buyer, itemName: row.itemName || "—", amount: Number(row.amountAtomic) / 1_000_000, status: "Verified", method: "Wallet transfer", hash: row.transactionHash, fromAddress: row.fromAddress ?? "", tone: "success" };
  });
  const filteredRows = useMemo(() => [...rows].filter(row => isWithinDashboardDateRange(row.timestamp, dateRange))
    .sort((a, b) => b.timestamp - a.timestamp || b.dbId - a.dbId), [rows, dateRange]);
  const reset = () => { setDateRange("All dates"); setSearch(""); };

  return <>
    <div className="transaction-toolbar">
      <div className="filter-control"><label htmlFor="payment-date-range">Date range</label><select id="payment-date-range" value={dateRange} onChange={e => setDateRange(e.target.value as DashboardDateRange)}><option>All dates</option><option>Today</option><option>Last 7 days</option><option>This month</option></select></div>
      <label className="search-field transaction-search"><Search size={15} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search buyer, item, intent or hash" aria-label="Search payments" /></label>
      <span className="history-scope">Verified Arc Testnet · USDC · Wallet transfer</span>
      <button className="button button-quiet reset-filter" onClick={reset}><RefreshCw size={14} /> Reset</button>
    </div>
    <div className="history-summary"><span><strong>{rows.length}</strong> loaded verified transfer{rows.length === 1 ? "" : "s"}{liveQuery.hasNextPage ? " · more available" : ""}</span><button className="small-link" onClick={() => void liveQuery.refetch()} disabled={liveQuery.isFetching}>{liveQuery.isFetching ? "Refreshing…" : "Refresh"}</button></div>
    {liveQuery.error && <div className="dashboard-data-message is-error" role="alert"><span>{liveQuery.isFetchNextPageError ? "Could not load the next page" : "Payment history could not be refreshed"}{rows.length ? "; showing loaded records" : ""}.</span><button className="small-link" onClick={() => void (liveQuery.isFetchNextPageError ? liveQuery.fetchNextPage() : liveQuery.refetch())}>Try again</button></div>}
    <div className="card table-card full-table transaction-table"><div className="table-wrap">{liveQuery.isLoading && !rows.length ? <div className="dashboard-data-message" role="status">Loading verified transfers…</div> : liveQuery.error && !rows.length ? null : filteredRows.length === 0 ? <div className="history-empty"><div className="empty-icon"><Search size={19} /></div><h3>{rows.length === 0 ? "No verified Arc transfers yet" : "No matching transactions"}</h3><p>{rows.length === 0 ? "Complete an Arc Testnet USDC checkout to see its verified transfer here." : "Adjust your date range or search, or reset the filters."}</p><button className="button button-quiet" onClick={reset}>Reset filters</button></div> : <table><thead><tr><th>Date / time</th><th>Transaction</th><th>Buyer / item</th><th>Amount</th><th>Status</th><th>Payment method</th><th /></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id} onClick={() => setSelectedId(row.id)} className="clickable-row"><td><strong>{row.date}</strong><small className="table-sub">{row.time}</small></td><td><span className="mono-id">{row.id}</span><small className="table-sub"><span className="mini-arc" />{row.hash}</small></td><td><div className="buyer-item-cell"><span>{row.buyer}</span><small>{row.itemName}</small></div></td><td className="amount-cell">${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}<small>USDC</small></td><td><StatusPill status={row.status} tone={row.tone} verified /></td><td><span className="method-label"><span className="method-glyph">⌁</span>{row.method}</span></td><td><button className="icon-button" aria-label={`Open ${row.id}`} onClick={e => { e.stopPropagation(); setSelectedId(row.id); }}><ArrowUpRight size={15} /></button></td></tr>)}</tbody></table>}</div></div>
    {liveQuery.hasNextPage && <div className="history-load-more"><button className="button button-quiet" onClick={() => void liveQuery.fetchNextPage()} disabled={liveQuery.isFetchingNextPage}>{liveQuery.isFetchingNextPage ? "Loading more…" : "Load more transfers"}</button></div>}
    {selectedId && <DetailDrawer id={selectedId} close={() => setSelectedId(null)} />}
  </>;
}

function SupportGuidelinesPage() {
  const sections = [
    {
      category: "OPERATE",
      color: "var(--primary)",
      items: [
        {
          title: "Overview",
          badge: "Live Telemetry",
          icon: <HomeIcon size={18} className="text-[var(--primary)]" />,
          summary: "Real-time analytics monitor displaying gross payment volume, successful transactions, onchain verification rate, and active operations queues.",
          points: [
            "Gross Payments: Aggregated total value of all payment intents created across your merchant workspace.",
            "Verified Success Rate: Percent of payments confirmed with cryptographic finality on Arc Testnet (Chain ID 5042002).",
            "Live Arc Ledger Strip: Highlights your latest customer sale and live connection to the Arc network.",
            "Quick Actions: One-click buttons to create new Payment Intents, trigger settlement reviews, or force an ArcScan sync."
          ],
          tip: "Click 'Sync ArcScan' at any time to query recent ERC-20 transfers directly from the block explorer."
        },
        {
          title: "Payments",
          badge: "Transaction Ledger",
          icon: <CreditCard size={18} className="text-[var(--primary)]" />,
          summary: "Full immutable record of every transaction intent, verified onchain hash, customer identifier, and timestamp.",
          points: [
            "Intent ID (PI_...): Server-signed token locking in the amount, destination wallet, and expiry before checkout.",
            "ArcScan Explorer Hash: Direct link to view the onchain proof of transfer and block confirmation.",
            "Filtering & Search: Filter by date ranges (Today, 7 days, 30 days), statuses (Succeeded, Verifying), and payment methods.",
            "Detail Drawer: Click any row to inspect buyer metadata, customer cart items, and delivery addresses."
          ],
          tip: "All transaction records are preserved locally and synced onchain, ensuring auditable proof of payment."
        },
        {
          title: "Payment Links",
          badge: "Hosted URLs",
          icon: <Link2 size={18} className="text-[var(--primary)]" />,
          summary: "Generate and distribute standalone, hosted payment links that allow customers to pay via wallet or QR without custom code.",
          points: [
            "Fixed & Open Amounts: Create fixed-price product checkouts or allow buyers to enter custom amounts for donations or services.",
            "Reusable & Single-Use: Set links to accept multiple payments or expire immediately after first completion.",
            "Mobile EVM Compatibility: Links automatically deep-link to MetaMask, Rabby, Rainbow, or Coinbase Wallet."
          ],
          tip: "Share payment links via SMS, Discord, Telegram, or embed them directly on social storefronts."
        },
        {
          title: "Invoices",
          badge: "Billing Engine",
          icon: <ReceiptText size={18} className="text-[var(--primary)]" />,
          summary: "Create and dispatch professional itemized invoices to clients with onchain settlement and automated due date tracking.",
          points: [
            "Itemized Line Items: Detail hourly rates, quantities, digital deliveries, and tax notes in USDC.",
            "Payment Status Tracking: Automatically transitions from 'Sent' to 'Paid' upon Arc block confirmation.",
            "PDF & Print Ready: Buyers receive clean, printable receipt records preserving contract reference numbers."
          ],
          tip: "Invoices eliminate chargeback fraud because settlements are verified cryptographically onchain."
        },
        {
          title: "Subscriptions",
          badge: "Recurring Billing",
          icon: <RefreshCw size={18} className="text-[var(--primary)]" />,
          summary: "Automate continuous weekly, monthly, or annual subscription billing cycles settled in stablecoins.",
          points: [
            "Predictable Cycles: Configure recurring intervals for SaaS tiers, memberships, and API access.",
            "Pre-authorized Allowances: Buyers permit recurring USDC transfers within bounded spending limits.",
            "Dunning & Retry Automation: Automatic reminders and grace periods if a wallet balance is insufficient."
          ],
          tip: "Combine with Druto Webhooks to automatically provision or revoke access in your web app."
        }
      ]
    },
    {
      category: "UNDERSTAND",
      color: "var(--secondary)",
      items: [
        {
          title: "Customers",
          badge: "Buyer CRM",
          icon: <UsersRound size={18} className="text-[var(--primary)]" />,
          summary: "Directory of all buyer wallet addresses and contact records derived from completed transactions.",
          points: [
            "Wallet Identity Mapping: Associates ENS names, emails, and hex addresses with lifetime purchase totals.",
            "Payment Frequency: View customer loyalty, transaction frequency, and aggregate spending in USDC.",
            "Exportable Ledger: Prepare customer lists for support, refunds, or targeted merchant updates."
          ],
          tip: "Customer records respect user privacy while giving merchants reliable spending history."
        },
        {
          title: "Seller transfers",
          badge: "Verified activity",
          icon: <WalletCards size={18} className="text-[var(--primary)]" />,
          summary: "View verified and pending USDC payments sent directly to the seller wallet. Druto does not hold a merchant balance.",
          points: [
            "Verified Transfers: Amounts confirmed on Arc and matched to a payment intent.",
            "Pending Verification: Intents that have not yet reached a verified payment state.",
            "No Custody: The seller receives funds directly in its own Arc wallet."
          ],
          tip: "This view reports payment activity; it is not a custodial balance or payout ledger."
        },
        {
          title: "Direct settlement",
          badge: "Buyer to seller",
          icon: <Send size={18} className="text-[var(--primary)]" />,
          summary: "The buyer's wallet sends USDC directly to the registered seller wallet; Druto verifies and reports the transfer.",
          points: [
            "Direct Transfer: Funds move from buyer wallet to seller wallet without Druto custody.",
            "One Seller per Intent: Multi-seller carts require separate payment intents; automatic splitting is not available.",
            "Payment Record: Verified payments include their onchain transaction reference."
          ],
          tip: "Druto verifies the transfer; it does not hold funds or execute a later seller payout."
        },
        {
          title: "Reports",
          badge: "Financial Accounting",
          icon: <Table2 size={18} className="text-[var(--primary)]" />,
          summary: "Comprehensive reconciliation sheets, volume breakdowns, and exportable financial reports for audits.",
          points: [
            "Period Summaries: Daily, monthly, and annual turnover metrics formatted for corporate bookkeeping.",
            "CSV Ledger Exports: One-click export formatted for standard accounting packages (QuickBooks, Xero).",
            "Discrepancy Checks: Flags any underpaid or overpaid transactions for immediate reconciliation."
          ],
          tip: "Use CSV exports at month-end to match blockchain hashes against internal ERP purchase orders."
        }
      ]
    },
    {
      category: "CONTROL",
      color: "var(--destructive)",
      items: [
        {
          title: "Risk controls & limitations",
          badge: "Testnet scope",
          icon: <ShieldCheck size={18} className="text-[var(--primary)]" />,
          summary: "Testnet payment verification only. This interface does not provide sanctions, identity, fraud, or country-eligibility screening.",
          points: [
            "Payment Matching: A verified state means the onchain transfer was matched to its payment intent.",
            "Testnet Only: Current release is configured for Arc Testnet USDC.",
            "No Compliance Decision: This view does not establish whether a person, wallet, or marketplace may legally transact.",
            "Production Controls: Seller review, sanctions screening, fraud operations, and jurisdiction policy are not represented here."
          ],
          tip: "Do not treat Testnet payment verification as KYC, sanctions screening, or a compliance approval."
        },
        {
          title: "Developers",
          badge: "Integration Hub",
          icon: <Code2 size={18} className="text-[var(--primary)]" />,
          summary: "Technical documentation, SDK snippets, interactive cURL / TypeScript code sandboxes, and webhook testing.",
          points: [
            "Interactive Sandbox: Test createIntent, retrieveIntent, and webhook validation in real-time.",
            "Multi-Language SDKs: Code samples provided for TypeScript, cURL, Python, and Go.",
            "Lifecycle Explorer: Follow the 6-step flow from seller onboarding to webhook verification."
          ],
          tip: "Access the full Developer Hub at `/developers` for live API request simulations."
        },
        {
          title: "API Keys",
          badge: "Authentication",
          icon: <KeyRound size={18} className="text-[var(--primary)]" />,
          summary: "Generate, inspect, and rotate secret API keys and webhook signing secrets for your backend server.",
          points: [
            "Secret Keys (`druto_sec_...`): Used on your backend server to create server-signed payment intents.",
            "Security Policy: Never expose secret keys in client-side HTML or frontend JavaScript.",
            "Key Rotation: Instantly revoke and issue new keys with zero downtime."
          ],
          tip: "Store API keys as environment variables (`DRUTO_API_KEY`) on your production servers."
        },
        {
          title: "Settings",
          badge: "Store Configuration",
          icon: <Settings2 size={18} className="text-[var(--primary)]" />,
          summary: "Configure store branding, merchant profile, default redirect URLs, and team notification preferences.",
          points: [
            "Brand Lockup & Logo: Customize the logo and brand name shown on hosted buyer checkout screens.",
            "Default Return URLs: Define where buyers are redirected upon successful payment or cancellation.",
            "Wallet Binding: Connect and verify your owner EVM address to unlock operator controls."
          ],
          tip: "Keep your return URLs up to date to ensure seamless customer handoff after checkout."
        }
      ]
    }
  ];

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (title: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const sec of sections) {
      for (const item of sec.items) {
        next[item.title] = true;
      }
    }
    setExpandedItems(next);
  };

  const collapseAll = () => {
    setExpandedItems({});
  };

  return (
    <div className="page-content support-page">
      <div className="page-header" style={{ marginBottom: "20px" }}>
        <div>
          <h2>Dashboard Guidelines & Operator Manual</h2>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={expandAll}
            className="button button-quiet"
            style={{ padding: "6px 14px", fontSize: "12px" }}
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="button button-quiet"
            style={{ padding: "6px 14px", fontSize: "12px" }}
          >
            Minimize all
          </button>
          <a className="button button-quiet" href="/developers" target="_blank" rel="noreferrer">
            <Code2 size={15} /> Developer Docs
          </a>
          <a className="button button-primary" href={ARC_TESTNET_EXPLORER_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Arc Testnet Explorer
          </a>
        </div>
      </div>

      {/* Structured Category Bars & Dropdown / Collapsible Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        {sections.map(sec => (
          <div key={sec.category} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Category Header Bar */}
            <div 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", 
                padding: "12px 18px", 
                borderRadius: "10px", 
                background: "var(--card)", 
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${sec.color}`
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <strong style={{ fontSize: "14px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--foreground)" }}>
                  {sec.category}
                </strong>
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>
                  · {sec.items.length} {sec.items.length === 1 ? "module" : "modules"}
                </span>
              </div>
            </div>

            {/* Individual Dropdown Cards Grid for Every Single Module */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "12px" }}>
              {sec.items.map(item => {
                const isExpanded = Boolean(expandedItems[item.title]);
                return (
                  <div 
                    key={item.title}
                    className="card" 
                    style={{ 
                      padding: "0", 
                      overflow: "hidden",
                      transition: "border-color 0.18s ease, box-shadow 0.18s ease",
                      border: isExpanded ? "1px solid var(--primary)" : "1px solid var(--border)"
                    }}
                  >
                    {/* Collapsible Header Bar (Always Visible, Click to Toggle) */}
                    <button
                      type="button"
                      onClick={() => toggleItem(item.title)}
                      style={{
                        width: "100%",
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: isExpanded ? "color-mix(in srgb, var(--primary) 4%, var(--card))" : "var(--card)",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        gap: "12px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                        <div className="empty-icon" style={{ width: "36px", height: "36px", minWidth: "36px" }}>
                          {item.icon}
                        </div>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--foreground)" }}>
                          {item.title}
                        </h3>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary)", flexShrink: 0 }}>
                        <span style={{ fontSize: "12px", fontWeight: 600 }}>
                          {isExpanded ? "Minimize" : "View"}
                        </span>
                        <div 
                          style={{ 
                            width: "28px", 
                            height: "28px", 
                            borderRadius: "50%", 
                            background: "var(--background)", 
                            border: "1px solid var(--border)", 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "center" 
                          }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </button>

                    {/* Dropdown Body (Visible when Expanded) */}
                    {isExpanded && (
                      <div style={{ padding: "20px", borderTop: "1px solid var(--border)", background: "var(--background)", animation: "fadeIn 0.2s ease" }}>
                        {/* Summary Description */}
                        <p style={{ fontSize: "14px", color: "var(--foreground)", lineHeight: "1.6", marginBottom: "16px" }}>
                          {item.summary}
                        </p>

                        {/* Operational Points */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                          {item.points.map((pt, pIdx) => (
                            <div 
                              key={pIdx} 
                              style={{ 
                                display: "flex", 
                                alignItems: "flex-start", 
                                gap: "8px", 
                                padding: "9px 12px", 
                                background: "var(--card)", 
                                border: "1px solid var(--border)", 
                                borderRadius: "8px", 
                                fontSize: "12px",
                                lineHeight: "1.5" 
                              }}
                            >
                              <span style={{ color: "var(--primary)", fontWeight: 800, minWidth: "16px" }}>•</span>
                              <span>{pt}</span>
                            </div>
                          ))}
                        </div>

                        {/* Pro Tip Footer */}
                        <div 
                          style={{ 
                            padding: "10px 14px", 
                            borderRadius: "8px", 
                            background: "color-mix(in srgb, var(--primary) 8%, var(--card))", 
                            border: "1px solid var(--border)", 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "8px",
                            fontSize: "12px",
                            color: "var(--foreground)"
                          }}
                        >
                          <Sparkles size={15} className="text-[var(--primary)] shrink-0" />
                          <span><strong>Operator Tip:</strong> {item.tip}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAQ & Support Contact Bottom Bar */}
      <div className="card" style={{ marginTop: "36px", padding: "26px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "18px" }}>
        <div>
          <strong style={{ fontSize: "15px", display: "block", color: "var(--foreground)" }}>Need direct integration or contract assistance?</strong>
          <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Our engineering team assists with multi-seller contract verification, SDK setup, and custom marketplace deployments.</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <a className="button button-quiet" href="mailto:support@druto.xyz">
            <Mail size={15} /> Contact Technical Support
          </a>
          <a className="button button-primary" href="/developers/start">
            <Rocket size={15} /> Open Quickstart Guide
          </a>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ user }: { moduleToggles: ModuleToggles; onToggleModule: (key: keyof ModuleToggles, val: boolean) => void; user: { name?: string | null; openId?: string | null; email?: string | null } }) {
  const [editing, setEditing] = useState(false);
  return <div className="page-content">
    <div className="dg-section-intro"><h2>Workspace settings</h2><p>Your account identity and the capabilities available in this release.</p></div>
    <div className="dg-settings-grid">
      <section className="card dg-settings-card"><h3>Account</h3>
        <div className="dg-settings-row"><span>Name</span><strong>{user.name || "Not provided"}</strong></div>
        <div className="dg-settings-row"><span>Email</span><strong>{user.email || "Not provided"}</strong></div>
        <div className="dg-settings-row"><span>Environment</span><strong>Arc Testnet · USDC</strong></div>
        <p className="dg-settings-note">Your login identity and your seller receiving wallet are managed separately.</p>
        <button type="button" className="dg-text-button" onClick={() => setEditing(true)}>Edit profile <ArrowUpRight size={15} /></button>
      </section>
      <section className="card dg-settings-card"><h3>Payment capabilities</h3>
        <div className="dg-settings-row"><span>Seller settlement</span><strong>Direct to receiving wallet</strong></div>
        <div className="dg-settings-row"><span>Platform fee</span><strong>0% direct-payment MVP</strong></div>
        <div className="dg-settings-row"><span>Integration</span><strong>Server SDK + signed webhooks</strong></div>
        <p className="dg-settings-note">Standalone payment links, invoices, recurring subscriptions and custodial payouts are not enabled in this release.</p>
      </section>
    </div>
    {editing && <ProfileEditModal user={user} onClose={() => setEditing(false)} />}
  </div>;
}

function PagePanel({
  active,
  onCreate,
  onNavigate,
  moduleToggles,
  onToggleModule,
  user,
}: {
  onNavigate: (section: string) => void;
  active: string;
  onCreate: () => void;
  moduleToggles: ModuleToggles;
  onToggleModule: (key: keyof ModuleToggles, val: boolean) => void;
  user: { name?: string | null; openId?: string | null; email?: string | null };
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const headings: Record<string, string> = { Payments: "Payments", "Payment Links": "Payment Links", Invoices: "Invoices", Subscriptions: "Subscriptions", Customers: "Customers", "Seller transfers": "Seller transfers", "Direct settlement": "Direct settlement", Reports: "Reports", "Risk controls & limitations": "Risk controls & limitations", Developers: "Developers", "API Keys": "API Keys", Settings: "Settings", Support: "Support & Guides" };
  const title = headings[active] || active;
  if (active === "Support") return <SupportGuidelinesPage />;
  if (active === "Settings") return <SettingsPage moduleToggles={moduleToggles} onToggleModule={onToggleModule} user={user} />;
  if (active === "Payments") return <div className="page-content"><PageHeader eyebrow="Ledger activity" title="Transaction history" description="Verified Arc Testnet USDC transfers, with buyer, item, and transaction details." action="Create payment" onAction={onCreate} /><TransactionHistory /></div>;
  if (active === "Seller transfers") return <BalancesPage />;
  if (active === "Direct settlement") return <SettlementsPage />;
  if (active === "Risk controls & limitations") return <RiskPage />;
  if (active === "Webhooks") return <DashboardWebhooks onSetup={() => onNavigate("Sellers")} readOnly={import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "dashboard"} />;
  if (active === "Developers") return <DashboardDevelopers onNavigate={onNavigate} readOnly={import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "dashboard"} />;
  if (active === "API Keys") return <ApiKeyManager onSellerSetup={() => onNavigate("Sellers")} readOnly={import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "dashboard"} />;
  if (active === "Sellers") return <SellerOnboarding />;
  if (active === "Receiving wallets") return <DashboardWallets />;
  if (active === "Customers") return <CustomersPage />;
  return (
    <div className="page-content">
      <PageHeader title={title} action={active === "Direct settlement" ? "View payments" : "Create new"} onAction={onCreate} />
      <div className="empty-feature card">
        <h3>{title} workspace</h3>
        <div className="empty-actions">
          <button className="button button-primary" onClick={onCreate}>
            <Plus size={16} /> {active === "Direct settlement" ? "View payments" : "Create record"}
          </button>
          <button className="button button-quiet" onClick={() => toast.info("This is a frontend-only test environment.")}>
            <BookOpen size={16} /> Read implementation notes
          </button>
        </div>
      </div>
    </div>
  );
}

function PageHeader({ action, onAction }: { eyebrow?: string; title?: string; description?: string; action?: string; onAction?: () => void }) { 
  if (!action || !onAction) return null;
  return (
    <div className="page-header">
      <div />
      <button className="button button-primary" onClick={onAction}>
        <Plus size={16} /> {action}
      </button>
    </div>
  ); 
}
function BalancesPage() { const summary = trpc.payments.summary.useQuery(); return <div className="page-content"><PageHeader title="Seller transfers" action="View payments" onAction={() => window.location.href = "/payments"} /><div className="balance-hero card"><div><span className="eyebrow">Verified transfers to seller wallets</span><strong>${summary.data?.grossUsdc ?? "0.00"}</strong><p><span className="live-dot" /> Arc Testnet · confirmed onchain payments</p><p className="mt-2 text-sm text-muted-foreground">Buyers send USDC directly to the seller’s wallet. Druto does not hold this balance.</p></div><img src={settleVisual} alt="Direct buyer-to-seller payment" /></div><div className="balance-grid"><Metric label="Verified transfers" value={`$${summary.data?.grossUsdc ?? "0.00"}`} delta="Sent directly to seller wallets" positive icon={<Check size={14} />} /><Metric label="Pending verification" value={`$${summary.data?.pendingUsdc ?? "0.00"}`} delta={`${summary.data?.pendingCount ?? 0} intents`} icon={<Timer size={14} />} /><Metric label="Druto-held funds" value="0.00" delta="Non-custodial flow" icon={<LockKeyhole size={14} />} /></div><div className="card table-card"><div className="card-heading"><div><span className="eyebrow">Verified movements</span><h3>Recent Arc transfers</h3></div><button className="text-button" onClick={() => toast.info("CSV export will be added with the reporting API.")}>Export CSV <ArrowDownRight size={14} /></button></div><PaymentTable compact /></div></div>; }
function SettlementsPage() { const summary = trpc.payments.summary.useQuery(); return <div className="page-content"><PageHeader title="Direct settlement" action="Review payments" onAction={() => window.location.href = "/payments"} /><div className="balance-hero card"><div><span className="eyebrow">Verified direct-to-seller payments</span><strong>${summary.data?.grossUsdc ?? "0.00"}</strong><p><span className="live-dot" /> Arc Testnet · buyer wallet to seller wallet</p></div><img src={settleVisual} alt="Direct buyer-to-seller payment" /></div><div className="balance-grid"><Metric label="Verified volume" value={`$${summary.data?.grossUsdc ?? "0.00"}`} delta={`${summary.data?.successfulCount ?? 0} transfers`} positive icon={<Check size={14} />} /><Metric label="Pending verification" value={`$${summary.data?.pendingUsdc ?? "0.00"}`} delta="Awaiting onchain verification" icon={<Timer size={14} />} /><Metric label="Druto custody" value="None" delta="Funds are sent directly to seller wallets" icon={<LockKeyhole size={14} />} /></div><div className="card empty-feature"><h3>Druto does not execute seller payouts</h3><p>Each buyer payment goes directly from the buyer’s wallet to the seller’s registered Arc wallet. Druto verifies and reports the transfer; it does not hold, reserve, or later disburse these funds.</p></div></div>; }
function RiskPage() { return <div className="page-content"><PageHeader title="Risk controls & limitations" action="Read release scope" onAction={() => window.location.href = "/developers#scope"} /><div className="risk-banner"><ShieldCheck size={21} /><div><strong>Testnet payment verification only</strong><span>This status is not a compliance approval or seller-risk assessment.</span></div><StatusPill status="Limited scope" tone="warning" /></div><div className="risk-layout"><div className="card table-card"><div className="card-heading"><div><span className="eyebrow">What this view does not provide</span><h3>No compliance screening claim</h3></div></div><div className="queue-empty"><AlertTriangle size={17} /><span>This Testnet release does not represent sanctions screening, seller KYC/KYB, fraud scoring, or country eligibility checks. Do not use this page as proof that a buyer, seller, or transaction is compliant.</span></div></div><div className="card controls-card"><span className="eyebrow">Payment verification scope</span><h3>Onchain checks</h3><Policy label="Network and asset" value="Arc Testnet · USDC" ok /><Policy label="Payment result" value="Verified against intent" ok /><Policy label="Sanctions / KYC / fraud review" value="Not provided" /><Policy label="Seller funds" value="Sent directly to seller wallet" /></div></div></div>; }
function Policy({ label, value, ok }: { label: string; value: string; ok?: boolean }) { return <div className="policy-row"><span>{ok ? <Check size={14} /> : <AlertTriangle size={14} />}{label}</span><strong>{value}</strong></div>; }
function SellerOwnershipDemo() { return <div className="card p-6 mt-6"><div className="flex items-start gap-3"><ShieldCheck size={20} /><div><span className="eyebrow">Seller activation</span><h3 className="mt-2">Wallet verification is paused</h3><p className="mt-2 text-muted-foreground">Seller records, payment destinations, API keys, and signed webhooks remain available. Wallet ownership verification will be restored later as a separate integration module.</p></div></div></div>; }
function CustomersPage() {
  const [search, setSearch] = useState("");
  const verified = trpc.payments.verifiedPayments.useQuery();
  const customers = useMemo(() => {
    const byBuyer = new Map<string, { email: string; volume: number; payments: number }>();
    for (const row of verified.data ?? []) {
      const identity = row.buyerLabel || row.fromAddress || "Wallet buyer";
      const current = byBuyer.get(identity) ?? { email: row.buyerLabel?.includes("@") ? row.buyerLabel : "Wallet identity", volume: 0, payments: 0 };
      current.volume += Number(row.amountAtomic) / 1_000_000;
      current.payments += 1;
      byBuyer.set(identity, current);
    }
    return Array.from(byBuyer.entries()).map(([name, details]) => ({ name, ...details }));
  }, [verified.data]);
  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? customers.filter(customer => `${customer.name} ${customer.email}`.toLowerCase().includes(query)) : customers;
  }, [customers, search]);
  return <div className="page-content">
    <PageHeader title="Customers" action="Refresh buyers" onAction={() => void verified.refetch()} />
    <div className="filter-bar">
      <div className="search-field wide"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search verified buyers" aria-label="Search verified buyers" /></div>
      <span className="history-scope">Verified Arc Testnet buyers</span>
    </div>
    {verified.error && <div className="dashboard-data-message is-error" role="alert"><span>Buyer data could not be loaded.</span><button className="small-link" onClick={() => void verified.refetch()}>Try again</button></div>}
    {verified.isLoading && <div className="dashboard-data-message" role="status">Loading verified buyers…</div>}
    {!verified.isLoading && !verified.error && filteredCustomers.length === 0 ? <div className="card empty-feature"><h3>{customers.length ? "No matching buyers" : "No verified buyers yet"}</h3><p>{customers.length ? "Try another name or wallet address." : "Complete an Arc Testnet USDC payment from a customer wallet to populate this workspace."}{customers.length > 0 && <button className="small-link" onClick={() => setSearch("")}> Clear search</button>}</p></div> : filteredCustomers.length > 0 && <div className="card table-card full-table"><table><thead><tr><th>Buyer</th><th>Contact</th><th>Payment volume</th><th>Payments</th><th>Status</th></tr></thead><tbody>{filteredCustomers.map(customer => <tr key={customer.name}><td><div className="customer-cell"><div className="avatar small">{customer.name.slice(0, 2).toUpperCase()}</div><strong>{customer.name}</strong></div></td><td className="muted-cell">{customer.email}</td><td className="amount-cell">${customer.volume.toFixed(2)}<small>USDC</small></td><td>{customer.payments}</td><td><StatusPill status="Verified" tone="success" /></td></tr>)}</tbody></table></div>}
  </div>;
}
function DetailDrawer({ id, close }: { id: string; close: () => void }) {
  const intentQuery = trpc.payments.getPrivateIntent.useQuery({ id });
  const intent = intentQuery.data;
  const amountUsdc = intent ? (Number(intent.amountAtomic) / 1_000_000).toFixed(2) : "—";
  return (
    <div className="drawer-backdrop" onClick={close}>
      <aside className="detail-drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div><span className="eyebrow">Payment detail</span><h3>{id}</h3></div>
          <button className="icon-button" onClick={close}><X size={18} /></button>
        </div>
        <div className="drawer-status">
          <StatusPill status={intent?.status === "succeeded" ? "Verified" : intent?.status ?? "Pending"} tone={intent?.status === "succeeded" ? "success" : "warning"} verified={intent?.status === "succeeded"} />
          <strong>${amountUsdc} <small>USDC</small></strong>
        </div>
        <DetailLine label="Payment Intent" value={id} mono copy />
        <DetailLine label="Customer / Item" value={intent?.itemName || intent?.buyerLabel || "Direct payment"} />
        <DetailLine label="Network" value="Arc Testnet · USDC" />
        <DetailLine label="Verification Status" value={intent?.status === "succeeded" ? "Verified on ArcScan" : "Awaiting Arc transfer"} />
        <DetailLine label="Seller ID" value={intent?.sellerId || "—"} />
        <DetailLine label="Merchant Destination" value={intent?.merchantAddress ? `${intent.merchantAddress.slice(0, 10)}…${intent.merchantAddress.slice(-8)}` : "—"} mono copy />
        <DetailLine label="Transaction" value={intent?.transactionHash ? `${intent.transactionHash.slice(0, 12)}…${intent.transactionHash.slice(-8)}` : "Pending onchain"} mono copy />
        {intent?.transactionHash && (
          <a className="button button-primary full-width" href={`${ARC_TESTNET_EXPLORER_URL}/tx/${intent.transactionHash}`} target="_blank" rel="noreferrer" style={{ marginTop: "1rem" }}>
            <ExternalLink size={15} /> View on Arc Testnet Explorer
          </a>
        )}
      </aside>
    </div>
  );
}
function DetailLine({ label, value, displayValue, mono, copy }: { label: string; value: string; displayValue?: string; mono?: boolean; copy?: boolean }) {
  const handleCopy = async () => {
    const copied = await copyReceiptValue(value);
    if (copied) toast.success(`${label} copied`);
    else toast.info(`Select and copy the ${label.toLowerCase()} manually.`);
  };
  return (
    <div className="detail-line">
      <span>{label}</span>
      <strong className={mono ? "mono-id" : ""} title={value}>
        {displayValue ?? value}
        {copy && (
          <button type="button" className="copy-control" aria-label={`Copy ${label}`} onClick={handleCopy}>
            <Copy size={13} />
          </button>
        )}
      </strong>
    </div>
  );
}

function PaymentLoadState({ error, retry, receipt = false }: { error?: { message: string } | null; retry: () => void; receipt?: boolean }) {
  return <div className="checkout-shell"><div className="checkout-brand"><Mark full /></div><main className="checkout-main"><div className="checkout-card" role={error ? "alert" : "status"}>
    <h1>{error ? "Payment unavailable" : receipt ? "Loading buyer receipt…" : "Loading checkout…"}</h1>
    {error && <><p>{error.message}</p><button className="button button-primary" onClick={retry}>Try again</button><Link href="/" className="button button-quiet">Back to home</Link></>}
  </div></main></div>;
}

function ReceiptPage() {
  const [location] = useLocation();
  const pathname = typeof window !== "undefined" ? window.location.pathname : location.split("?")[0];
  const intentId = pathname.split("/").filter(Boolean).pop() || "";
  const receiptPreview = new URLSearchParams(typeof window !== "undefined" ? window.location.search : location.split("?")[1] ?? "").get("demo") === "mixed-receipt";
  const utils = trpc.useUtils();
  const query = trpc.payments.getIntent.useQuery(
    { id: intentId },
    { enabled: Boolean(intentId) && !receiptPreview, retry: false, refetchInterval: (query) => (query.state.error || query.state.data?.status === "succeeded" ? false : 3000) }
  );
  const verifyTransfer = trpc.payments.verifyTransfer.useMutation();
  const [manualHash, setManualHash] = useState("");
  const [isVerifyingManual, setIsVerifyingManual] = useState(false);

  const [paymentQueue] = useState<MarketplacePaymentQueue | null>(() => { try { if (receiptPreview) return { orderId: "DR-MULTI-PREVIEW", intentIds: ["preview-intent-a", "preview-intent-b"], checkoutUrls: ["/receipt/preview-intent-a?demo=mixed-receipt", "/receipt/preview-intent-b?demo=mixed-receipt"], sellerNames: ["Druto Labs", "Mosaic Works"] }; const saved = window.localStorage.getItem(MARKETPLACE_PAYMENT_QUEUE_KEY); return saved ? JSON.parse(saved) as MarketplacePaymentQueue : null; } catch { return null; } });
  const previewSeller = intentId === "preview-intent-b" ? { name: "Mosaic Works", productId: "ledger-kit", itemName: "Ledger Operations Kit", amountAtomic: "2500000", sellerId: "mosaic-works" } : { name: "Druto Labs", productId: "api-pro", itemName: "Arc API Pro", amountAtomic: "1000000", sellerId: "druto-labs" };
  const previewOrderContext = JSON.stringify({ items: [{ productId: previewSeller.productId, name: previewSeller.itemName, seller: previewSeller.name, unitPrice: Number(previewSeller.amountAtomic) / 1_000_000, quantity: 1 }], delivery: "Digital delivery", shippingAddress: { name: "Alex Rivera", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" });
  const previewIntent = { id: intentId, itemName: previewSeller.itemName, buyerLabel: "buyer@example.com", returnUrl: "/marketplace", orderContext: previewOrderContext, amountAtomic: previewSeller.amountAtomic, asset: "USDC", network: "arc-testnet", merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217", status: "succeeded", transactionHash: "0x3f7a18b9c6f2e8319e7a8f94cb44d32e185c7210e3954f9a0c3b84a9235d72f1", expiresAt: new Date(), platformFeeBps: 0, platformFeeAmount: "0", merchantPayoutAmount: previewSeller.amountAtomic, splitContractAddress: null, verificationOrigin: window.location.origin } as NonNullable<typeof query.data>;
  const intent = query.data ?? (receiptPreview ? previewIntent : undefined);
  const nextCheckout = paymentQueue ? getNextMarketplaceCheckout(paymentQueue, intentId) : null;

  const handleManualVerify = async () => {
    if (!intent || !manualHash.trim().startsWith("0x")) {
      toast.error("Please enter a valid Arc transaction hash (starts with 0x...)");
      return;
    }
    setIsVerifyingManual(true);
    try {
      await verifyTransfer.mutateAsync({
        paymentIntentId: intent.id,
        transactionHash: manualHash.trim(),
        payerSignature: await signPaymentConfirmation(intent, manualHash.trim()),
      });
      await query.refetch();
      await utils.payments.summary.invalidate();
      await utils.payments.verifiedPayments.invalidate();
      toast.success("Payment successfully verified on ArcScan!");
    } catch (err: any) {
      toast.error(err?.message || "ArcScan transfer verification failed. Please ensure the transaction is confirmed on Arc.");
    } finally {
      setIsVerifyingManual(false);
    }
  };

  if (!intent) return <PaymentLoadState error={query.error} retry={() => { void query.refetch(); }} receipt />;
  const { amount, isSucceeded, orderContext, lineItems, buyerEmail, shipping } = buildReceiptSummary(intent);
  const statusLabel = isSucceeded ? "Payment Receipt" : "Verification in progress";
  const copyValue = async (value: string, label: string) => { const copied = await copyReceiptValue(value); if (copied) toast.success(`${label} copied`); else toast.info(`Select and copy the ${label.toLowerCase()} manually.`); };

  return (
    <div className="checkout-shell">
      <div className="checkout-brand">
        <Mark full />
        <span className="checkout-test">
          <span className="live-dot" /> {receiptPreview ? "Mixed-seller preview" : "Buyer receipt"}
        </span>
      </div>

      <main className="checkout-main receipt-layout">
        <div className="checkout-intro receipt-intro">
          <h1>Payment <em>{isSucceeded ? "verified." : "awaiting verification."}</em></h1>
          <p>{isSucceeded ? "Your USDC payment was recorded on Arc Testnet and accepted by the merchant." : "Your receipt is saved and will update after Druto verifies the Arc Testnet transaction."}</p>
          <div className="checkout-trust">
            <span><ShieldCheck size={14} /> Verified payment state</span>
            <span><LockKeyhole size={14} /> Non-custodial checkout</span>
            <span><ReceiptText size={14} /> Payment reference available</span>
          </div>
          <div className="receipt-side-actions">
            <button className="button button-quiet receipt-print" onClick={() => window.print()}>
              <Printer size={14} /> Save or print receipt
            </button>
            {intent.transactionHash ? (
              <a
                className="button button-primary receipt-side-btn"
                href={`${ARC_TESTNET_EXPLORER_URL}/tx/${intent.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> View on Arc Testnet Explorer
              </a>
            ) : (
              <a
                className="button button-quiet receipt-side-btn"
                href={`${ARC_TESTNET_EXPLORER_URL}/address/${intent.merchantAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> View Merchant on Arc Testnet Explorer
              </a>
            )}
          </div>
        </div>

        <div className={`checkout-card receipt-card receipt-card-enhanced ${isSucceeded ? "receipt-final" : "receipt-pending"}`}>
          <div className="receipt-hero">
            <div className={isSucceeded ? "success-mark" : "submitted-orbit"}>
              {isSucceeded ? <Check size={26} /> : <RefreshCw size={24} className="animate-spin" />}
            </div>
            <div>
              <span className="eyebrow">{statusLabel}</span>
              <h2>${amount} <small>USDC</small></h2>
            </div>
          </div>

          <div className="receipt-order-banner">
            <div>
              <span className="eyebrow">Payment reference</span>
              <strong>{intent.id}</strong>
            </div>
            <div className="receipt-order-badge">
              <Box size={14} /> {lineItems.length} {lineItems.length === 1 ? "item" : "items"}
            </div>
          </div>

          <section className="receipt-section">
            <div className="receipt-section-heading">
              <span><Box size={15} /> Purchased items</span>
              <span>Qty</span>
            </div>
            <div className="receipt-items">
              {lineItems.map((item, index) => (
                <div className="receipt-item" key={`${item.productId}-${index}`}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.seller} · ${item.unitPrice.toFixed(2)} each</small>
                  </div>
                  <strong>× {item.quantity}</strong>
                </div>
              ))}
            </div>
            <div className="receipt-total">
              <span>Total paid</span>
              <strong>${amount} <small>USDC</small></strong>
            </div>
          </section>

          {receiptPreview ? <section className="receipt-section receipt-meta-grid">
            <div>
              <span className="receipt-meta-label"><RefreshCw size={13} /> Delivery</span>
              <strong>{orderContext?.delivery ?? "Digital delivery"}</strong>
            </div>
            <div>
              <span className="receipt-meta-label"><Mail size={13} /> Buyer</span>
              <strong>{buyerEmail}</strong>
            </div>
            {shipping && (
              <div className="receipt-meta-wide">
                <span className="receipt-meta-label"><MapPin size={13} /> Shipping to</span>
                <strong>{shipping.name}</strong>
                <small>{shipping.line1}, {shipping.city}, {shipping.postalCode}, {shipping.country}</small>
              </div>
            )}
          </section> : <section className="receipt-section"><p>Buyer contact, shipping and delivery details are available from the marketplace through its authorized order access.</p></section>}

          <section className="receipt-section proof-section">
            <div className="receipt-section-heading">
              <span><ShieldCheck size={15} /> Onchain proof</span>
              <span className="proof-badge">
                <span className="live-dot" /> {isSucceeded ? "Verified on ArcScan" : "Pending"}
              </span>
            </div>
            <DetailLine label="Payment Intent" value={intent.id} mono copy />
            <DetailLine label="Network / asset" value="Arc Testnet · USDC" />
            <DetailLine
              label="Merchant wallet"
              value={intent.merchantAddress}
              displayValue={truncateHash(intent.merchantAddress, 7, 6)}
              mono
              copy
            />
            <DetailLine
              label="Transaction"
              value={intent.transactionHash ?? "Pending verification"}
              displayValue={intent.transactionHash ? truncateHash(intent.transactionHash, 8, 6) : "Pending verification"}
              mono={Boolean(intent.transactionHash)}
              copy={Boolean(intent.transactionHash)}
            />
          </section>

          {!isSucceeded && (
            <div style={{ padding: "14px", background: "#f8fdf9", border: "1px solid #d4ebd9", borderRadius: "8px", margin: "12px 0" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#2d3436", display: "block", marginBottom: "4px" }}>
                Already sent USDC on Arc Testnet?
              </span>
              <p style={{ fontSize: "12px", color: "#636e72", margin: "0 0 8px" }}>
                Paste the Arc transaction hash from your wallet or ArcScan to instantly finalize verification.
              </p>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  placeholder="0x..."
                  value={manualHash}
                  onChange={e => setManualHash(e.target.value)}
                  style={{ flex: 1, padding: "6px 8px", fontSize: "12px", border: "1px solid #ced6e0", borderRadius: "6px" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleManualVerify}
                  disabled={isVerifyingManual || !manualHash.trim()}
                  style={{ fontSize: "12px", padding: "0 10px", height: "30px" }}
                >
                  {isVerifyingManual ? "Verifying…" : "Verify Tx"}
                </button>
              </div>
            </div>
          )}

          <div className="receipt-actions">
            {!isSucceeded && (
              <button
                className="button button-primary full-width"
                onClick={() => window.location.href = `/checkout/${intent.id}`}
              >
                <WalletCards size={15} /> Return to checkout & pay
              </button>
            )}

            {intent.returnUrl && (
              <button className="button button-quiet full-width" onClick={() => window.location.href = intent.returnUrl!}>
                Return to marketplace <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          <div className="checkout-footer">
            <span>Receipt generated by <strong>druto</strong></span>
          </div>
        </div>
      </main>
    </div>
  );
}

function CheckoutPage() {
  const [location] = useLocation();
  const pathname = typeof window !== "undefined" ? window.location.pathname : location.split("?")[0];
  const intentId = pathname.split("/").filter(Boolean).pop() || "";
  const intentQuery = trpc.payments.getIntent.useQuery({ id: intentId }, { enabled: Boolean(intentId), retry: false });
  const verifyTransfer = trpc.payments.verifyTransfer.useMutation();
  const intent = intentQuery.data;
  const amountDisplay = intent ? (Number(intent.amountAtomic) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "0.00";

  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [connecting, setConnecting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(() => { try { return window.localStorage.getItem(`druto:payment:${intentId}`); } catch { return null; } });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [checkoutQr, setCheckoutQr] = useState<{ intentId: string; dataUrl: string } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const isArc = chainId === ARC_CHAIN_ID;
  const isSucceeded = intent?.status === "succeeded";
  const isExpired = Boolean(intent && !txHash && new Date(intent.expiresAt).getTime() <= nowMs);
  const requiresNewPaymentLink = Boolean(intent && (intent.platformFeeBps !== 0 || intent.splitContractAddress));
  const marketplaceReturnUrl = safeMarketplaceReturnUrl(intent?.returnUrl);

  useEffect(() => {
    setCheckoutQr(null);
    if (!intent || isSucceeded || isExpired || requiresNewPaymentLink || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(window.location.href, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 180,
      color: { dark: "#172b27", light: "#ffffff" },
    }).then((dataUrl) => {
      if (!cancelled) setCheckoutQr({ intentId: intent.id, dataUrl });
    }).catch(() => {
      if (!cancelled) setCheckoutQr(null);
    });
    return () => { cancelled = true; };
  }, [intent?.id, isSucceeded, isExpired, requiresNewPaymentLink]);

  const updateBalance = async (addr: `0x${string}`) => {
    setBalanceStatus("loading");
    try {
      const bal = await fetchArcUsdcBalance(addr);
      setUsdcBalance(bal);
      setBalanceStatus("ready");
    } catch {
      setUsdcBalance(null);
      setBalanceStatus("unavailable");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            const addr = accounts[0] as `0x${string}`;
            setAddress(addr);
            void updateBalance(addr);
          }
        })
        .catch(console.error);

      window.ethereum.request({ method: "eth_chainId" })
        .then((hex: string) => setChainId(parseInt(hex, 16)))
        .catch(console.error);

      const handleAccounts = (accounts: string[]) => {
        if (accounts.length > 0) {
          const addr = accounts[0] as `0x${string}`;
          setAddress(addr);
          void updateBalance(addr);
        } else {
          setAddress(null);
          setUsdcBalance(null);
        }
      };

      const handleChain = (hex: string) => {
        const parsed = parseInt(hex, 16);
        setChainId(parsed);
        if (address) void updateBalance(address);
      };

      window.ethereum.on?.("accountsChanged", handleAccounts);
      window.ethereum.on?.("chainChanged", handleChain);

      return () => {
        window.ethereum?.removeListener?.("accountsChanged", handleAccounts);
        window.ethereum?.removeListener?.("chainChanged", handleChain);
      };
    }
  }, [address]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error("No EVM wallet detected (e.g. MetaMask or Rabby)");
      return;
    }
    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        const addr = accounts[0] as `0x${string}`;
        setAddress(addr);
        const hex = await window.ethereum.request({ method: "eth_chainId" });
        const parsed = parseInt(hex, 16);
        setChainId(parsed);
        void updateBalance(addr);
        if (parsed !== ARC_CHAIN_ID) {
          await switchToArc();
        }
        toast.success("Wallet connected");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  };

  const switchToArc = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_CHAIN_ID_HEX }],
      });
      toast.success("Switched to Arc Testnet");
    } catch (switchError: any) {
      if (switchError.code === 4902 || switchError.message?.includes("Unrecognized chain")) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: ARC_CHAIN_ID_HEX,
                chainName: "Arc Testnet",
                nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
                rpcUrls: [ARC_RPC_URL],
                blockExplorerUrls: [ARC_TESTNET_EXPLORER_URL],
              },
            ],
          });
          toast.success("Arc Testnet added to wallet");
        } catch {
          toast.error("Could not add Arc Testnet to wallet");
        }
      } else {
        toast.error("Failed to switch network to Arc Testnet");
      }
    }
  };

  const handlePay = async () => {
    if (!intent || paying || verifying || isSucceeded) return;
    if (intent.platformFeeBps !== 0 || intent.splitContractAddress) {
      toast.error("This payment link uses older fee terms. Ask the marketplace for a new link; contact support if you already paid.");
      return;
    }
    if (!txHash && new Date(intent.expiresAt).getTime() <= Date.now()) {
      toast.error("This checkout has expired. Ask the merchant for a new payment link.");
      return;
    }
    if (!address) {
      await connectWallet();
      return;
    }
    if (!isArc) {
      await switchToArc();
      return;
    }

    setPaying(true);
    let submittedHash = txHash;
    try {
      let hash = submittedHash;
      if (!hash) {
        if (!window.ethereum) throw new Error("Reconnect your EVM wallet before sending this payment");
        const data = encodeArcUsdcTransfer(intent.merchantAddress as `0x${string}`, intent.amountAtomic);
        hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: ARC_USDC_ADDRESS,
            data,
          },
        ],
        });
      }
      if (!hash) throw new Error("The wallet did not return a transaction hash");

      submittedHash = hash;
      setTxHash(hash);
      try { window.localStorage.setItem(`druto:payment:${intent.id}`, hash); } catch { /* in-memory hash still prevents a second send */ }
      setPaying(false);
      setVerifying(true);
      toast.info("Transaction sent. Sign the confirmation to link it to this order. Retrying will not send another payment.");

      const result = await verifyTransfer.mutateAsync({
        paymentIntentId: intent.id,
        transactionHash: hash,
        payerSignature: await signPaymentConfirmation(intent, hash),
      });

      toast.success("Payment verified onchain!");
      window.location.href = `/receipt/${intent.id}`;
    } catch (err: any) {
      setPaying(false);
      setVerifying(false);
      toast.error(checkoutWalletError(err, Boolean(submittedHash)));
    }
  };

  if (!intent) return <PaymentLoadState error={intentQuery.error} retry={() => { void intentQuery.refetch(); }} />;

  return (
    <div className="checkout-shell">
      <div className="checkout-brand">
        <Mark full />
        <span className="checkout-test">
          <span className="live-dot" /> Arc Testnet
        </span>
      </div>

      <main className="checkout-main">
        <div className="checkout-intro">
          <span className="eyebrow">
            <span className="eyebrow-line" /> Hosted payment flow
          </span>
          <h1>
            Pay with <em>Arc USDC.</em>
          </h1>
          <p>
            Non-custodial checkout direct to the seller wallet on Arc Testnet.
          </p>
          <div className="checkout-trust">
            <span><ShieldCheck size={14} /> Direct seller settlement</span>
            <span><LockKeyhole size={14} /> Non-custodial</span>
            <span><Zap size={14} /> Fast finality</span>
          </div>
        </div>

        <div className="checkout-card">
          <div className="checkout-card-head">
            <span>Payment #{(intent?.id ?? intentId) || "pending"}</span>
            <span className="checkout-expiry">
              <Timer size={14} /> {intent ? "Item: " + intent.itemName : "Intent unavailable"}
            </span>
          </div>

          <div className="checkout-amount">
            <span>Total due</span>
            <strong>{"$" + amountDisplay} <small>USDC</small></strong>
          </div>

          {requiresNewPaymentLink && !isSucceeded && (
            <div role="alert" className="checkout-note" style={{ margin: "14px 0" }}>
              This payment link uses unsupported fee terms and cannot be paid. Return to the marketplace for a new link. If you already paid, contact the marketplace with your transaction hash.
            </div>
          )}
          {isExpired && !isSucceeded && (
            <div role="alert" className="checkout-note" style={{ margin: "14px 0" }}>
              This checkout has expired. Ask the marketplace for a new payment link; do not send funds using this one.
            </div>
          )}

          <div className="checkout-network">
            <span className="network-symbol">A</span>
            <div>
              <strong>Arc Testnet</strong>
              <small>Chain ID: 5042002 · Asset: USDC</small>
            </div>
            <BadgeCheck size={17} style={{ color: "#1e9b83", marginLeft: "auto" }} />
          </div>

          <div className="card p-4" style={{ background: "#fafafa", borderRadius: "8px", border: "1px solid #eaeaea", margin: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: "#666", fontWeight: 500 }}>Buyer Wallet</span>
              {address ? (
                <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#1e9b83", fontWeight: 600 }}>
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              ) : (
                <span style={{ fontSize: "12px", color: "#888" }}>Not connected</span>
              )}
            </div>

            {address && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", paddingTop: "6px", borderTop: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666" }}>Arc USDC Balance:</span>
                <strong style={{ color: usdcBalance === null ? "#666" : Number(usdcBalance) < Number(intent ? Number(intent.amountAtomic) / 1_000_000 : 0) ? "#e17055" : "#1e9b83" }}>
                  {usdcBalance !== null ? `${usdcBalance} USDC` : balanceStatus === "unavailable" ? "Balance unavailable" : "Loading…"}
                </strong>
              </div>
            )}

            {!isArc && address && (
              <div style={{ marginTop: "10px" }}>
                <button
                  type="button"
                  className="button button-quiet full-width"
                  style={{ background: "#ffeaa7", color: "#d63031", border: "none", fontSize: "12px", fontWeight: 600, padding: "6px" }}
                  onClick={switchToArc}
                >
                  <AlertCircle size={14} /> Switch to Arc Testnet
                </button>
              </div>
            )}
          </div>

          {isSucceeded ? (
            <button
              className="button button-primary full-width"
              onClick={() => window.location.href = `/receipt/${intent.id}`}
            >
              <Check size={16} /> View buyer receipt
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {isExpired || requiresNewPaymentLink ? (
                marketplaceReturnUrl ? (
                  <a className="button button-primary full-width" href={marketplaceReturnUrl}>
                    <ArrowUpRight size={16} /> Return to marketplace for a new payment link
                  </a>
                ) : (
                  <p className="checkout-note" role="status">Ask the marketplace for a new payment link. This checkout cannot be paid.</p>
                )
              ) : !address ? (
                <button
                  className="button button-primary full-width"
                  onClick={connectWallet}
                  disabled={connecting}
                >
                  <Wallet size={16} /> {connecting ? "Connecting Wallet…" : "Connect EVM Wallet"}
                </button>
              ) : (
                <button
                  className="button button-primary full-width"
                  onClick={handlePay}
                  disabled={paying || verifying || !isArc}
                >
                  {paying ? (
                    <>Confirm in wallet…</>
                  ) : verifying ? (
                    <><RefreshCw size={14} className="animate-spin" /> Verifying on Arc Testnet…</>
                  ) : txHash ? (
                    <>Retry verification</>
                  ) : (
                    <>Pay ${amountDisplay} USDC with Wallet</>
                  )}
                </button>
              )}

              {intent && (
                <button
                  type="button"
                  className="button button-quiet full-width"
                  style={{ fontSize: "12px" }}
                  onClick={() => window.location.href = `/receipt/${intent.id}`}
                >
                  View receipt / pending state
                </button>
              )}
            </div>
          )}

          {checkoutQr?.intentId === intent.id && !isExpired && !requiresNewPaymentLink && !isSucceeded && (
            <div className="qr-panel" role="group" aria-label="Share this hosted checkout">
              <div><img src={checkoutQr.dataUrl} alt="QR code that opens this Druto hosted checkout" /></div>
              <span>
                <strong>Open this checkout on another device</strong>
                <small>Scan to open the secure checkout link. Wallet support depends on the browser or wallet app.</small>
                <button type="button" className="text-button" onClick={() => { void copyReceiptValue(window.location.href).then(copied => copied ? toast.success("Checkout link copied") : toast.info("Copy the checkout link from your browser address bar.")); }}>
                  <Copy size={13} /> Copy checkout link
                </button>
              </span>
            </div>
          )}

          <div className="checkout-note" role="status" style={{ marginTop: "12px" }}>
            <LockKeyhole size={13} /> Direct onchain transfer of USDC on Arc Testnet (chain 5042002).
          </div>

          <div className="checkout-footer">
            <span>Powered by <strong>druto</strong></span>
            <span><LockKeyhole size={12} /> Arc Testnet</span>
          </div>
        </div>
      </main>
    </div>
  );
}
const marketplaceProducts = [
  { id: "api-pro", name: "Arc API Pro", category: "Developer tools", description: "Production-shaped API workspace with usage insights and team controls.", price: 1, seller: "Druto Labs", sellerId: "druto-labs", image: heroVisual, badge: "Bestseller", availability: "In stock" },
  { id: "ledger-kit", name: "Ledger Operations Kit", category: "Finance", description: "A practical operating system for modern stablecoin finance teams.", price: 2.5, seller: "Mosaic Works", sellerId: "mosaic-works", image: flowVisual, badge: "New", availability: "Limited" },
  { id: "arc-starter", name: "Arc Testnet Starter", category: "Developer tools", description: "A guided starter kit for building and testing EVM payment flows.", price: 0.75, seller: "Druto Labs", sellerId: "druto-labs", image: settleVisual, badge: "Testnet", availability: "In stock" },
  { id: "merchant-playbook", name: "Merchant Playbook", category: "Business", description: "Patterns for hosted checkout, payment links, and buyer receipts.", price: 1.25, seller: "Dawn Studio", sellerId: "dawn-studio", image: heroVisual, badge: "Guide", availability: "In stock" },
  { id: "risk-console", name: "Risk Console", category: "Operations", description: "Review queues, policy controls, and settlement readiness in one view.", price: 3, seller: "Atlas Compute", sellerId: "atlas-compute", image: flowVisual, badge: "Popular", availability: "Limited" },
  { id: "wallet-connect", name: "Wallet Connect Pack", category: "Developer tools", description: "EVM wallet patterns for QR checkout and mobile handoff.", price: 1.5, seller: "Meridian Ops", sellerId: "meridian-ops", image: settleVisual, badge: "Updated", availability: "In stock" },
];

type CartLine = MarketplaceCartLine;
const MARKETPLACE_PAYMENT_QUEUE_KEY = "druto-demo-marketplace-payment-queue";

function MarketplacePage() {
  const mixedPreview = new URLSearchParams(window.location.search).get("demo") === "mixed-checkout";
  const [step, setStep] = useState<"shop" | "cart" | "checkout">(() => mixedPreview ? "checkout" : "shop");
  const [cart, setCart] = useState<CartLine[]>(() => { try { if (mixedPreview) return [{ productId: "api-pro", quantity: 1 }, { productId: "ledger-kit", quantity: 1 }]; const saved = window.localStorage.getItem("druto-demo-marketplace-cart"); return saved ? JSON.parse(saved) : [{ productId: "api-pro", quantity: 1 }]; } catch { return [{ productId: "api-pro", quantity: 1 }]; } });
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("Featured");
  const [selectedProduct, setSelectedProduct] = useState<typeof marketplaceProducts[number] | null>(null);
  const [recoveryQueue, setRecoveryQueue] = useState<MarketplacePaymentQueue | null>(null);
  const [customerEmail, setCustomerEmail] = useState("buyer@example.com");
  const [shippingAddress, setShippingAddress] = useState({ name: "Alex Rivera", line1: "", city: "", postalCode: "", country: "United States" });
  const [delivery, setDelivery] = useState("Digital delivery");
  const createIntent = trpc.payments.createIntent.useMutation();
  useEffect(() => { window.localStorage.setItem("druto-demo-marketplace-cart", JSON.stringify(cart)); }, [cart]);
  const categories = ["All", ...Array.from(new Set(marketplaceProducts.map(product => product.category)))];
  const filteredProducts = useMemo(() => marketplaceProducts.filter(product => (category === "All" || product.category === category) && `${product.name} ${product.description} ${product.seller}`.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => sort === "Price: low to high" ? a.price - b.price : sort === "Price: high to low" ? b.price - a.price : a.id.localeCompare(b.id)), [category, searchTerm, sort]);
  const totals = calculateMarketplaceTotals(cart, marketplaceProducts, delivery);
  const cartDetails = totals.details as Array<CartLine & { product: typeof marketplaceProducts[number] }>;
  const { subtotal, shipping, total } = totals;
  const sellerGroups = splitMarketplaceCartBySeller(cart, marketplaceProducts, delivery, shippingAddress, customerEmail);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const addToCart = (productId: string) => { setCart(current => current.some(line => line.productId === productId) ? current.map(line => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { productId, quantity: 1 }]); toast.success("Added to cart"); };
  const updateQuantity = (productId: string, quantity: number) => setCart(current => updateMarketplaceQuantity(current, productId, quantity));
  const payWithDruto = async () => { try { setRecoveryQueue(null); if (!customerEmail || !shippingAddress.name || !shippingAddress.line1 || !shippingAddress.city || !shippingAddress.postalCode) { toast.error("Complete contact and shipping details first"); return; } if (!sellerGroups.length) { toast.error("Your cart has no available products"); return; } const orderId = `DR-${Date.now().toString().slice(-6)}`; const queue = await prepareMarketplaceSellerPayments(orderId, sellerGroups, "druto-demo-marketplace", payload => createIntent.mutateAsync(payload), nextQueue => window.localStorage.setItem(MARKETPLACE_PAYMENT_QUEUE_KEY, JSON.stringify(nextQueue))); if (!queue.checkoutUrls[0]) throw new Error("No seller checkout was created"); toast.success(sellerGroups.length > 1 ? `Created ${sellerGroups.length} seller payments` : "Opening Druto checkout"); window.location.href = queue.checkoutUrls[0]; } catch (error) { const queue = error instanceof MarketplacePaymentQueueError ? error.queue : null; setRecoveryQueue(queue?.intentIds.length ? queue : null); toast.error(queue?.intentIds.length ? `Prepared ${queue.intentIds.length} seller payment${queue.intentIds.length === 1 ? "" : "s"}. Resume the saved checkout below.` : error instanceof Error ? error.message : "Unable to open Druto checkout"); } };
  return (
    <div className="marketplace-shell">
      <header className="marketplace-nav">
        <div className="brand-lockup">
          <Mark />
          <span>northstar marketplace</span>
        </div>
        <div className="marketplace-nav-actions">
          <span className="checkout-test">
            <span className="live-dot" /> Arc Testnet demo
          </span>
          <button className="marketplace-cart-button" onClick={() => setStep("cart")}>
            <ReceiptText size={16} /> Cart <b>{cartCount}</b>
          </button>
        </div>
      </header>
      <main className="marketplace-main">
        <div className="marketplace-breadcrumb">
          Marketplace <span>/</span> {step === "shop" ? "Discover" : step === "cart" ? "Shopping cart" : "Checkout"}
        </div>
        {step === "shop" && (
          <>
            <section className="marketplace-hero">
              <div>
                <span className="eyebrow">Druto marketplace</span>
                <h1>Tools for the <em>onchain</em> economy.</h1>
                <p>Curated software and playbooks for teams building with stablecoins, wallets, and Arc.</p>
              </div>
              <div className="marketplace-hero-note">
                <span className="arc-ring" />
                <strong>Pay with Druto</strong>
                <small>USDC on Arc Testnet</small>
              </div>
            </section>
            <div className="marketplace-toolbar">
              <div className="search-field marketplace-search">
                <Search size={15} />
                <input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="Search products, sellers, or categories"
                />
              </div>
              <div className="marketplace-categories">
                {categories.map(item => (
                  <button
                    key={item}
                    className={classNames("category-chip", category === item && "active")}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <select className="marketplace-sort" value={sort} onChange={event => setSort(event.target.value)}>
                <option>Featured</option>
                <option>Price: low to high</option>
                <option>Price: high to low</option>
              </select>
            </div>
            <section className="product-grid">
              {filteredProducts.map(product => (
                <article
                  className="marketplace-card"
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => event.key === "Enter" && setSelectedProduct(product)}
                >
                  <div className="marketplace-card-art">
                    <img src={product.image} alt="" />
                    <span>{product.badge}</span>
                  </div>
                  <div className="marketplace-card-body">
                    <small>{product.category} · {product.seller}</small>
                    <h2>{product.name}</h2>
                    <span className="availability-label">{product.availability}</span>
                    <p>{product.description}</p>
                    <div className="marketplace-card-foot">
                      <strong>${product.price.toFixed(2)} <small>USDC</small></strong>
                      <button className="button button-primary" onClick={() => addToCart(product.id)}>
                        <Plus size={15} /> Add
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            {selectedProduct && (
              <div className="product-detail-backdrop" onClick={() => setSelectedProduct(null)}>
                <div className="product-detail card" onClick={event => event.stopPropagation()}>
                  <button
                    className="icon-button product-detail-close"
                    onClick={() => setSelectedProduct(null)}
                    aria-label="Close product details"
                  >
                    <X size={17} />
                  </button>
                  <img src={selectedProduct.image} alt="" />
                  <span className="eyebrow">{selectedProduct.category} · {selectedProduct.seller}</span>
                  <h2>{selectedProduct.name}</h2>
                  <span className="availability-label">{selectedProduct.availability}</span>
                  <p>{selectedProduct.description}</p>
                  <strong>${selectedProduct.price.toFixed(2)} USDC</strong>
                  <button
                    className="button button-primary full-width"
                    onClick={() => {
                      addToCart(selectedProduct.id);
                      setSelectedProduct(null);
                    }}
                  >
                    Add to cart
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {step === "cart" && (
          <section className="marketplace-workspace">
            <div className="marketplace-workspace-head">
              <div>
                <span className="eyebrow">Your selection</span>
                <h1>Shopping cart</h1>
              </div>
              <button className="button button-quiet" onClick={() => setStep("shop")}>
                <ArrowDownRight size={15} /> Continue shopping
              </button>
            </div>
            <div className="cart-layout">
              <div className="card cart-lines">
                {cartDetails.length ? (
                  cartDetails.map(line => (
                    <div className="cart-line" key={line.product.id}>
                      <img src={line.product.image} alt="" />
                      <div>
                        <small>{line.product.category} · {line.product.seller}</small>
                        <h3>{line.product.name}</h3>
                        <span>${line.product.price.toFixed(2)} USDC each</span>
                      </div>
                      <select
                        value={line.quantity}
                        onChange={event => updateQuantity(line.product.id, Number(event.target.value))}
                      >
                        {[1, 2, 3, 4, 5].map(quantity => (
                          <option key={quantity} value={quantity}>{quantity}</option>
                        ))}
                      </select>
                      <strong>${(line.product.price * line.quantity).toFixed(2)}</strong>
                      <button
                        className="icon-button"
                        onClick={() => updateQuantity(line.product.id, 0)}
                        aria-label={`Remove ${line.product.name}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-feature">
                    <h3>Your cart is empty</h3>
                    <button className="button button-primary" onClick={() => setStep("shop")}>Browse products</button>
                  </div>
                )}
              </div>
              <OrderSummary
                subtotal={subtotal}
                shipping={shipping}
                total={total}
                actionLabel="Proceed to checkout"
                onAction={() => setStep("checkout")}
                disabled={!cartDetails.length}
              />
            </div>
          </section>
        )}
        {step === "checkout" && (
          <section className="marketplace-workspace">
            <div className="marketplace-workspace-head">
              <div>
                <span className="eyebrow">Secure checkout</span>
                <h1>Complete your order</h1>
              </div>
              <button className="button button-quiet" onClick={() => setStep("cart")}>
                <ArrowDownRight size={15} /> Back to cart
              </button>
            </div>
            <div className="checkout-layout">
              <div className="checkout-form card">
                <div className="checkout-step">
                  <span>01</span>
                  <div>
                    <h2>Contact information</h2>
                    <p>We’ll send your order receipt and access details here.</p>
                  </div>
                </div>
                <label>
                  Email address
                  <input
                    value={customerEmail}
                    onChange={event => setCustomerEmail(event.target.value)}
                    type="email"
                  />
                </label>
                <div className="checkout-step">
                  <span>02</span>
                  <div>
                    <h2>Delivery method</h2>
                    <p>Choose how you want this demo order delivered.</p>
                  </div>
                </div>
                <div className="delivery-options">
                  <button
                    className={classNames("delivery-option", delivery === "Digital delivery" && "selected")}
                    onClick={() => setDelivery("Digital delivery")}
                  >
                    <Zap size={17} />
                    <span>
                      <strong>Digital delivery</strong>
                      <small>Available instantly · Free</small>
                    </span>
                    <Check size={16} />
                  </button>
                  <button
                    className={classNames("delivery-option", delivery === "Priority delivery" && "selected")}
                    onClick={() => setDelivery("Priority delivery")}
                  >
                    <Box size={17} />
                    <span>
                      <strong>Priority delivery</strong>
                      <small>Demo shipping · $0.25 USDC</small>
                    </span>
                    <Check size={16} />
                  </button>
                </div>
                <div className="checkout-step">
                  <span>03</span>
                  <div>
                    <h2>Shipping details</h2>
                    <p>Used to complete this demo order.</p>
                  </div>
                </div>
                <div className="shipping-fields">
                  <input
                    value={shippingAddress.name}
                    onChange={event => setShippingAddress({ ...shippingAddress, name: event.target.value })}
                    placeholder="Full name"
                    aria-label="Full name"
                    required
                  />
                  <input
                    value={shippingAddress.line1}
                    onChange={event => setShippingAddress({ ...shippingAddress, line1: event.target.value })}
                    placeholder="Street address"
                    aria-label="Street address"
                    required
                  />
                  <div>
                    <input
                      value={shippingAddress.city}
                      onChange={event => setShippingAddress({ ...shippingAddress, city: event.target.value })}
                      placeholder="City"
                      aria-label="City"
                      required
                    />
                    <input
                      value={shippingAddress.postalCode}
                      onChange={event => setShippingAddress({ ...shippingAddress, postalCode: event.target.value })}
                      placeholder="Postal code"
                      aria-label="Postal code"
                      required
                    />
                  </div>
                </div>
                <div className="checkout-step">
                  <span>04</span>
                  <div>
                    <h2>Payment method</h2>
                    <p>Select a method. Crypto checkout is powered by Druto.</p>
                  </div>
                </div>
                <div className="payment-methods">
                  <div className="payment-option selected">
                    <div className="payment-option-icon">
                      <WalletCards size={18} />
                    </div>
                    <span>
                      <strong>Pay with Druto</strong>
                      <small>USDC on Arc Testnet · wallet or QR</small>
                    </span>
                    <Check size={16} />
                  </div>
                  <div className="payment-option disabled">
                    <CreditCard size={18} />
                    <span>
                      <strong>Card payment</strong>
                      <small>Not enabled in this demo</small>
                    </span>
                  </div>
                </div>
                {sellerGroups.length > 1 && (
                  <div className="checkout-note seller-split-note">
                    <Layers size={14} /> This order has {sellerGroups.length} sellers. Druto will collect one secure payment per seller.
                  </div>
                )}
                {recoveryQueue?.intentIds.length ? (
                  <div className="checkout-note seller-recovery-note">
                    <RefreshCw size={14} />
                    <span>
                      <strong>{recoveryQueue.intentIds.length} seller payment{recoveryQueue.intentIds.length === 1 ? "" : "s"} prepared.</strong> One later seller could not be prepared.{" "}
                      <button className="text-button" onClick={() => window.location.href = recoveryQueue.checkoutUrls[0]}>
                        Resume first seller checkout
                      </button>
                    </span>
                  </div>
                ) : null}
                <button
                  className="button button-primary checkout-pay"
                  onClick={payWithDruto}
                  disabled={createIntent.isPending || !customerEmail}
                >
                  <WalletCards size={16} />{" "}
                  {createIntent.isPending
                    ? "Preparing seller payments…"
                    : `Pay $${total.toFixed(2)} with Druto${sellerGroups.length > 1 ? ` · ${sellerGroups.length} sellers` : ""}`}
                </button>
              </div>
              <OrderSummary
                subtotal={subtotal}
                shipping={shipping}
                total={total}
                actionLabel="Pay with Druto"
                onAction={payWithDruto}
                disabled={createIntent.isPending || !cartDetails.length}
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function OrderSummary({ subtotal, shipping, total, actionLabel, onAction, disabled }: { subtotal: number; shipping: number; total: number; actionLabel: string; onAction: () => void; disabled?: boolean }) { return <aside className="card order-summary"><div className="card-heading"><div><span className="eyebrow">Order summary</span><h3>Review total</h3></div><ReceiptText size={18} /></div><div className="summary-row"><span>Subtotal</span><strong>${subtotal.toFixed(2)} USDC</strong></div><div className="summary-row"><span>Delivery</span><strong>{shipping ? `$${shipping.toFixed(2)} USDC` : "Free"}</strong></div><div className="summary-total"><span>Total</span><strong>${total.toFixed(2)} <small>USDC</small></strong></div><button className="button button-primary full-width" onClick={onAction} disabled={disabled}>{actionLabel} <ArrowUpRight size={15} /></button><small className="summary-safe"><LockKeyhole size={12} /> You’ll review the exact amount in Druto before signing.</small></aside>; }


export function DashboardWorkspace({ user, onExitPreview }: { user: { name?: string | null; openId?: string | null; email?: string | null }; onExitPreview?: () => void }) {
  const { theme, toggleTheme } = useDashboardTheme();
  const [location] = useLocation();
  const readSection = () => {
    if (typeof window === "undefined") return location.startsWith("/payments") ? "Payments" : "Overview";
    const section = new URLSearchParams(window.location.search).get("section");
    const names: Record<string,string> = { overview:"Overview", payments:"Payments", sellers:"Sellers", wallets:"Receiving wallets", developers:"Developers", keys:"API Keys", webhooks:"Webhooks", settings:"Settings", support:"Support" };
    return names[section ?? ""] ?? (window.location.pathname.startsWith("/payments") ? "Payments" : "Overview");
  };
  const [active, setActive] = useState(readSection);
  useEffect(() => {
    const onBack = () => setActive(readSection());
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  useEffect(() => {
    const names: Record<string,string> = { Overview:"overview", Payments:"payments", Sellers:"sellers", "Receiving wallets":"wallets", Developers:"developers", "API Keys":"keys", Webhooks:"webhooks", Settings:"settings", Support:"support" };
    const url = new URL(window.location.href);
    const desired = names[active];
    if (!desired || (url.searchParams.get("section") ?? (url.pathname === "/payments" ? "payments" : "overview")) === desired) return;
    url.searchParams.set("section", desired);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  }, [active]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [moduleToggles, setModuleToggles] = useState<ModuleToggles>(getStoredModuleToggles);

  const handleToggleModule = (key: keyof ModuleToggles, val: boolean) => {
    const updated = { ...moduleToggles, [key]: val };
    setModuleToggles(updated);
    if (!onExitPreview) saveStoredModuleToggles(updated);
    const labels: Record<keyof ModuleToggles, string> = {
      paymentLinks: "Payment Links",
      invoices: "Invoices",
      subscriptions: "Subscriptions",
      reports: "Reports",
    };
    toast.success(`${labels[key]} ${val ? "added to sidebar" : "removed from sidebar"}`);
  };

  const focusPayments = () => {
    setActive("Overview");
    window.setTimeout(() => document.getElementById("dashboard-payment-search")?.focus(), 80);
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"]')) { event.preventDefault(); focusPayments(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nav = document.getElementById("druto-dashboard-sidebar");
    const focusables = () => Array.from(nav?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select') ?? []).filter(node => node.getClientRects().length);
    const focusNavigation = () => {
      if (nav && !nav.contains(document.activeElement)) focusables()[0]?.focus({ preventScroll: true });
    };
    const focusFrame = window.requestAnimationFrame(focusNavigation);
    // A closing dialog can restore focus after this drawer begins opening.
    // Recheck once after the visibility transition without disturbing focus inside.
    const focusAfterTransition = window.setTimeout(focusNavigation, 300);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMobileNavOpen(false); return; }
      if (event.key !== "Tab") return;
      const nodes = focusables(), first = nodes[0], last = nodes[nodes.length - 1];
      if (!nav?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const mq = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (mq.matches) setMobileNavOpen(false); };
    mq.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", keyboard);
    return () => { window.cancelAnimationFrame(focusFrame); window.clearTimeout(focusAfterTransition); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keyboard); mq.removeEventListener("change", closeOnDesktop); previous?.focus(); };
  }, [mobileNavOpen]);

  const title = active === "Overview" ? "Overview" : active;
  const create = () => onExitPreview
    ? toast.info("Preview is read-only. Sign in to create real payment intents.")
    : D1_WALLET_ONLY
    ? setActive("Sellers")
    : setShowCreate(true);
  return (
    <div className="app-shell dashboard-glass">
      {mobileNavOpen && <button type="button" className="dg-nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar
        active={active}
        setActive={page => { setActive(page); setMobileNavOpen(false); }}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        user={user}
        moduleToggles={moduleToggles}
        onExitPreview={onExitPreview}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <main className="main-shell">
        <Topbar theme={theme} onToggleTheme={toggleTheme} title={title} onCreate={create} onExitPreview={onExitPreview} overview={active === "Overview"} onSearch={focusPayments} onOpenNavigation={() => setMobileNavOpen(true)} />
        <div className="dg-view-frame" key={active}>
        {active === "Overview" ? (
          <DashboardOverview setActive={setActive} onCreate={create} createLabel={D1_WALLET_ONLY && !onExitPreview ? "Set up checkout" : "Create payment"} />
        ) : (
          <PagePanel onNavigate={setActive}
            active={active}
            onCreate={create}
            moduleToggles={moduleToggles}
            onToggleModule={handleToggleModule}
            user={user}
          />
        )}
        </div>
      </main>
      {showCreate && <CreatePayment close={() => setShowCreate(false)} />}
    </div>
  );
}

function DashboardAccess() {
  const [preview, setPreview] = useState(() => import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "dashboard");
  const enterPreview = () => {
    window.history.replaceState(null, "", "/dashboard?preview=dashboard");
    setPreview(true);
  };
  const exitPreview = () => {
    window.history.replaceState(null, "", "/dashboard");
    setPreview(false);
  };
  if (import.meta.env.DEV && preview && DevDashboardPreview) {
    return <Suspense fallback={<div className="dashboard-loading" role="status">Loading sample workspace…</div>}>
      <DevDashboardPreview onExit={exitPreview} />
    </Suspense>;
  }
  return <AuthenticatedDashboardAccess onPreview={import.meta.env.DEV ? enterPreview : undefined} />;
}

function AuthenticatedDashboardAccess({ onPreview }: { onPreview?: () => void }) {
  const session = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  if (session.isLoading) {
    return (
      <div className="dashboard-loading">
        <Mark />
        <div className="auth-spinner" aria-hidden="true" />
        <strong>Loading Druto workspace…</strong>
        <span>Verifying your sign-in session.</span>
      </div>
    );
  }

  if (!session.data || dashboardAccessState(session.data) !== "workspace") {
    return <AccountLoginCard onPreview={onPreview} />;
  }

  return <DashboardWorkspace user={session.data} />;
}

export default function Home() { const [location] = useLocation(); if (location.startsWith("/receipt")) return <ReceiptPage />; if (location.startsWith("/checkout")) return <CheckoutPage />; return <DashboardAccess />; }
function CreatePayment({ close }: { close: () => void }) {
  const [amount, setAmount] = useState("1.00");
  const [orderId, setOrderId] = useState(() => `DR-${crypto.randomUUID()}`);
  const [itemName, setItemName] = useState("Arc API Pro — annual access");
  const createIntent = trpc.payments.createIntent.useMutation();
  const submit = async () => {
    try {
      const result = await createIntent.mutateAsync({ externalOrderId: orderId, itemName, amount });
      window.location.href = result.checkoutUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create Payment Intent");
    }
  };
  return <div className="modal-backdrop" onClick={close}><div className="modal-card" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">Arc Testnet · USDC only</span><h3>Create payment intent</h3></div><button className="icon-button" onClick={close}><X size={18} /></button></div><p className="modal-description">The server fixes the amount, asset, network, and merchant wallet before the buyer signs anything.</p><label>Amount<input className="form-input" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" /></label><div className="form-two"><label>Asset<select className="form-input" value="USDC" disabled><option>USDC</option></select></label><label>Network<select className="form-input" value="Arc Testnet" disabled><option>Arc Testnet</option></select></label></div><label>Order reference<input className="form-input" value={orderId} onChange={e => setOrderId(e.target.value)} /></label><label>Item<input className="form-input" value={itemName} onChange={e => setItemName(e.target.value)} /></label><div className="modal-actions"><button className="button button-quiet" onClick={close}>Cancel</button><button className="button button-primary" onClick={submit} disabled={createIntent.isPending}><Plus size={15} /> {createIntent.isPending ? "Creating…" : "Create intent & open checkout"}</button></div></div></div>;
}
