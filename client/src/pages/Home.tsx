// Ledger Light reminder: editorial Swiss structure, warm white surfaces, graphite text, cobalt actions, Druto Sea Glass finality, IBM Plex Mono for identifiers, and restrained motion.
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import { buildMarketplaceCheckoutPayload, calculateMarketplaceTotals, getNextMarketplaceCheckout, parseMarketplaceOrderContext, prepareMarketplaceSellerPayments, MarketplacePaymentQueueError, splitMarketplaceCartBySeller, updateMarketplaceQuantity, type MarketplaceCartLine, type MarketplacePaymentQueue } from "@/lib/marketplace";
import { developerSdkSnippet } from "@/lib/developer";
import AccountLoginCard from "@/components/AccountLoginCard";
import ApiKeyManager from "@/components/ApiKeyManager";
import SellerOnboarding from "@/components/SellerOnboarding";
import WalletConnectButton from "@/components/WalletConnectButton";
import { buildReceiptSummary, copyReceiptValue, truncateHash } from "@/lib/receipt";
import { dashboardAccessState } from "@/lib/access";
import { ARC_CHAIN_ID, ARC_CHAIN_ID_HEX, ARC_RPC_URL, ARC_USDC_ADDRESS, CIRCLE_FAUCET_URL, fetchArcUsdcBalance, encodeArcUsdcTransfer } from "@/lib/arcChain";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeCheck, Bell, BookOpen, Box, Check, ChevronDown, ChevronUp, CircleDollarSign, Clipboard, Code2, Copy, CreditCard, Database, ExternalLink, FileCheck2, FileText, Gauge, GitBranch, HelpCircle, Home as HomeIcon, KeyRound, Layers, LayoutGrid, LifeBuoy, Link2, ListFilter, LockKeyhole, LogOut, Mail, MapPin, Menu, MoreHorizontal, Network, PauseCircle, Plus, Printer, ReceiptText, RefreshCw, Rocket, Search, Send, Settings2, ShieldCheck, Sparkles, Table2, Terminal, Timer, TrendingUp, UserRound, UsersRound, Wallet, WalletCards, X, Zap
} from "lucide-react";

const logo = "/DRUTO_D_logo.png";
const heroVisual = "/manus-storage/druto-editorial-network_c7fbc025.jpg";
const flowVisual = "/manus-storage/druto-payment-flow_17da128c.jpg";
const settleVisual = "/manus-storage/druto-settlement-abstract_ac9457d1.jpg";

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

function Mark() { return <img src={logo} alt="" className="brand-mark" />; }

function privyIdentityLabel(privyUser: ReturnType<typeof usePrivy>["user"]) {
  if (!privyUser) return null;
  if (privyUser.email?.address) return privyUser.email.address;
  if (privyUser.google?.email || privyUser.google?.name) return privyUser.google.email ?? privyUser.google.name;
  if (privyUser.github?.username || privyUser.github?.email) return privyUser.github.username ?? privyUser.github.email;
  return null;
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
    <div className="modal-backdrop" onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: "400px", padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0 }}>Edit Profile</h3>
          <button className="icon-button" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-secondary)" }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-subtle, #d3e1d8)" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "var(--text-secondary)" }}>Profile Image URL</label>
            <input type="text" value={profileImage} onChange={e => setProfileImage(e.target.value)} placeholder="https://example.com/avatar.png" style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--border-subtle, #d3e1d8)" }} />
          </div>
          <button type="submit" className="button button-primary" disabled={updateProfile.isPending} style={{ marginTop: "8px", justifyContent: "center" }}>
            {updateProfile.isPending ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, collapsed, setCollapsed, user, moduleToggles }: { active: string; setActive: (value: string) => void; collapsed: boolean; setCollapsed: (value: boolean) => void; user: { name?: string | null; openId?: string | null; profileImage?: string | null }; moduleToggles: ModuleToggles }) {
  const { user: privyUser, authenticated: privyAuthenticated, logout: privyLogout } = usePrivy();
  const drutoLogout = trpc.auth.logout.useMutation();
  const createChallenge = trpc.auth.createWalletChallenge.useMutation();
  const bindWallet = trpc.auth.bindWallet.useMutation();
  const utils = trpc.useUtils();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isBinding, setIsBinding] = useState(false);
  const isPrivy = user.openId?.startsWith("privy:") === true;
  const identity = isPrivy ? privyIdentityLabel(privyUser) : null;
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();

  const navGroups = useMemo(() => [
    {
      label: "Operate",
      items: [
        "Overview",
        "Payments",
        ...(moduleToggles.paymentLinks ? ["Payment Links"] : []),
        ...(moduleToggles.invoices ? ["Invoices"] : []),
        ...(moduleToggles.subscriptions ? ["Subscriptions"] : []),
      ],
    },
    {
      label: "Understand",
      items: [
        "Customers",
        "Balances",
        "Settlements",
        ...(moduleToggles.reports ? ["Reports"] : []),
      ],
    },
    {
      label: "Control",
      items: ["Risk & compliance", "Developers", "API Keys", "Settings"],
    },
  ], [moduleToggles]);

  const handleBindWallet = async () => {
    setIsBinding(true);
    try {
      let activeAddress = address;
      if (!isConnected || !activeAddress) {
        const connector = connectors[0];
        if (!connector) throw new Error("No EVM wallet detected (e.g. MetaMask).");
        const connectResult = await connectAsync({ connector });
        activeAddress = connectResult.accounts[0];
      }
      if (!activeAddress) throw new Error("Could not detect wallet address.");
      const challenge = await createChallenge.mutateAsync({ walletAddress: activeAddress });
      const signature = await signMessageAsync({ message: challenge.message });
      await bindWallet.mutateAsync({
        challengeId: challenge.challengeId,
        walletAddress: activeAddress,
        signature,
      });
      await utils.auth.me.invalidate();
      toast.success(`Wallet ${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)} bound to your account!`);
      setProfileOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to bind wallet");
    } finally {
      setIsBinding(false);
    }
  };

  const logout = async () => {
    try {
      if (privyAuthenticated) await privyLogout();
      await drutoLogout.mutateAsync();
      utils.auth.me.setData(undefined, null);
      window.location.href = "/dashboard";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not log out");
    }
  };
  return <aside className={classNames("sidebar", collapsed && "sidebar-collapsed")}>
    <div className="brand-row"><div className="brand-lockup"><Mark /><span>druto</span></div><button className="icon-button sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle navigation"><Menu size={17} /></button></div>
    <div className="environment-switch"><span className="live-dot" /> <span>Test environment</span><ChevronDown size={13} /></div>
    <nav className="side-nav">{navGroups.map(group => <div key={group.label} className="nav-group"><div className="nav-label">{group.label}</div>{group.items.map(item => <button key={item} onClick={() => item === "Developers" ? window.location.href = "/developers" : setActive(item)} className={classNames("nav-item", active === item && "nav-active")}><NavIcon item={item} /><span>{item}</span></button>)}</div>)}</nav>
    <div className="sidebar-bottom">
      <button className={classNames("nav-item", active === "Support" && "nav-active")} onClick={() => setActive("Support")}><LifeBuoy size={17} /><span>Support & Guides</span></button>
      <div className={classNames("profile-wrap", profileOpen && "profile-open")}>
        <button className="user-card" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen} aria-label="Open profile menu">
          <div className="avatar" style={{ overflow: "hidden" }}>
            {user.profileImage ? <img src={user.profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (user.name?.slice(0, 2).toUpperCase() || "DR")}
          </div>
          <div className="user-meta">
            <strong>{user.name || "Workspace"}</strong>
            <span>{isPrivy ? "Signed in with Privy" : "Workspace owner"}</span>
          </div>
          <MoreHorizontal size={16} />
        </button>
        {profileOpen && <div className="profile-menu">
          {identity && (
            <div className="profile-menu-heading">
              <strong>{isPrivy ? "Signed in with Privy" : "Signed in"}</strong>
              <span>{identity}</span>
            </div>
          )}
          <button className="profile-logout" onClick={() => { setEditModalOpen(true); setProfileOpen(false); }} style={{ borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.08))", marginBottom: "0.25rem", borderRadius: "0", color: "inherit" }}>
            <Settings2 size={15} /> Edit Profile
          </button>
          <button className="profile-logout" onClick={() => void logout()} disabled={drutoLogout.isPending}>
            <LogOut size={15} />{drutoLogout.isPending ? "Logging out…" : "Logout"}
          </button>
        </div>}
      </div>
    </div>
    {editModalOpen && <ProfileEditModal user={user} onClose={() => setEditModalOpen(false)} />}
  </aside>;
}

function NavIcon({ item }: { item: string }) {
  const icons: Record<string, any> = { Overview: HomeIcon, Payments: CreditCard, "Payment Links": Link2, Invoices: ReceiptText, Subscriptions: RefreshCw, Customers: UsersRound, Balances: WalletCards, Settlements: Send, Reports: Table2, "Risk & compliance": ShieldCheck, Developers: Code2, "API Keys": KeyRound, Settings: Settings2 };
  const Icon = icons[item] || Box; return <Icon size={17} />;
}

function Topbar({ title, onCreate }: { title: string; onCreate: () => void }) {
  let privy: any = null;
  try {
    privy = usePrivy();
  } catch {
    privy = null;
  }
  const logout = trpc.auth.logout.useMutation();
  const utils = trpc.useUtils();
  const syncMutation = trpc.payments.syncArcPayments.useMutation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSyncArcScan = async () => {
    try {
      const res = await syncMutation.mutateAsync();
      await utils.payments.summary.invalidate();
      await utils.payments.verifiedPayments.invalidate();
      if (res.newlySynced > 0) {
        toast.success(`Synced ${res.newlySynced} new payment${res.newlySynced === 1 ? "" : "s"} from ArcScan!`);
      } else {
        toast.info(`ArcScan sync complete (${res.scannedCount} recent transfers scanned, all up-to-date)`);
      }
    } catch (err: any) {
      toast.error(err?.message || "ArcScan sync failed");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await utils.payments.summary.invalidate();
      await utils.payments.verifiedPayments.invalidate();
      toast.success("Live Arc activity refreshed");
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const disconnect = async () => {
    try {
      if (privy?.authenticated) await privy.logout();
    } catch (e) {
      console.error("Privy logout failed", e);
    }
    await logout.mutateAsync();
    utils.auth.me.setData(undefined, null);
    window.location.href = "/";
  };

  return (
    <header className="topbar">
      <div className="topbar-title">
        <div className="breadcrumb">Workspace <span>/</span> Operations</div>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        <div className="search-field">
          <Search size={15} />
          <input placeholder="Search anything" aria-label="Search" />
          <kbd>⌘ K</kbd>
        </div>
        <button
          className="icon-button"
          title="Refresh"
          aria-label="Refresh"
          onClick={handleRefresh}
        >
          <RefreshCw size={17} className={isRefreshing ? "animate-spin" : ""} />
        </button>
        <button
          className="button button-sync-light"
          onClick={handleSyncArcScan}
          disabled={syncMutation.isPending}
          title="Sync latest onchain ArcScan transfers"
        >
          {syncMutation.isPending ? "Syncing Arc…" : "Sync ArcScan"}
        </button>
        <button className="icon-button" title="Notifications" aria-label="Notifications">
          <Bell size={17} />
          <i className="notification-dot" />
        </button>
        <WalletConnectButton />
        <button className="button button-quiet" onClick={() => void disconnect()} disabled={logout.isPending}>
          {logout.isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}

function Overview({ setActive, onCreate }: { setActive: (v: string) => void; onCreate: () => void }) {
  const [period, setPeriod] = useState("Last 30 days");
  const utils = trpc.useUtils();
  const summary = trpc.payments.summary.useQuery(undefined, { refetchInterval: 5000 });
  const liveIntents = trpc.payments.verifiedPayments.useQuery(undefined, { refetchInterval: 5000 });

  const latestSale = [...(liveIntents.data ?? [])].sort(
    (a, b) => new Date(b.finalizedAt ?? b.createdAt ?? Date.now()).getTime() - new Date(a.finalizedAt ?? a.createdAt ?? Date.now()).getTime()
  )[0];

  return (
    <div className="page-content overview-page">
      <div className="live-ledger-strip">
        <div>
          <span className="eyebrow"><span className="live-dot" /> Live Arc ledger</span>
          <strong>{summary.data ? `$${summary.data.availableUsdc} USDC` : "No verified USDC yet"}</strong>
          <small>{summary.data ? `${summary.data.successfulCount} verified · ${summary.data.pendingCount} pending` : "Create a Payment Intent to begin a testnet payment"}</small>
        </div>
        <div>
          <span className="eyebrow">Latest sold item</span>
          <strong>{latestSale?.itemName ?? "Awaiting first sale"}</strong>
          <small>{latestSale ? `Succeeded · ${Number(latestSale.amountAtomic) / 1_000_000} USDC · ${latestSale.transactionHash.slice(0, 10)}…` : "Seller activity will appear here after verification"}</small>
        </div>
      </div>

      <section className="metric-grid"><Metric label="Gross payments" value={summary.data ? `$${summary.data.grossUsdc}` : "—"} delta={summary.data ? `${summary.data.totalCount} intents` : "Awaiting verified data"} positive icon={<ArrowUpRight size={14} />} /><Metric label="Successful payments" value={summary.data && summary.data.totalCount > 0 ? `${Math.round((summary.data.successfulCount / summary.data.totalCount) * 100)}%` : "—"} delta={summary.data ? `${summary.data.successfulCount} verified` : "Awaiting first verified payment"} positive icon={<TrendingUp size={14} />} /><Metric label="Available balance" value={summary.data ? `$${summary.data.availableUsdc}` : "—"} delta="USDC · verified only" icon={<WalletCards size={14} />} /><Metric label="To settle" value={summary.data ? `$${summary.data.availableUsdc}` : "—"} delta="Verified USDC only" icon={<Send size={14} />} /></section>
    <section className="overview-grid"><div className="card revenue-card"><div className="card-heading"><div><span className="eyebrow">{summary.data ? "Verified volume" : "Demo visual · awaiting verified activity"}</span><h3>Payment activity</h3></div><button className="select-button" onClick={() => setPeriod(period === "Last 30 days" ? "Last 7 days" : "Last 30 days")}>{period}<ChevronDown size={14} /></button></div>{!summary.data?.successfulCount && <div className="chart-empty-state"><div className="empty-icon"><TrendingUp size={18} /></div><strong>No verified activity yet</strong><span>Complete an Arc Testnet USDC checkout to populate this analytics view.</span></div>}<div className="chart-wrap" style={{ display: summary.data?.successfulCount ? undefined : "none" }}><div className="chart-y"><span>{summary.data ? `$${summary.data.grossUsdc}` : "—"}</span><span>{summary.data ? `$${summary.data.pendingUsdc}` : "—"}</span><span>USDC</span><span>0</span></div><div className="chart"><div className="chart-grid"><i /><i /><i /><i /></div><svg viewBox="0 0 700 210" preserveAspectRatio="none" aria-label="Payment activity chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1e9b83" stopOpacity=".26" /><stop offset="1" stopColor="#1e9b83" stopOpacity="0" /></linearGradient></defs><path d="M0,175 C42,166 58,128 96,145 S151,102 190,123 S240,96 275,109 S321,49 358,82 S407,72 438,98 S489,58 520,68 S570,24 604,56 S661,28 700,38 L700,210 L0,210 Z" fill="url(#chartFill)" /><path d="M0,175 C42,166 58,128 96,145 S151,102 190,123 S240,96 275,109 S321,49 358,82 S407,72 438,98 S489,58 520,68 S570,24 604,56 S661,28 700,38" fill="none" stroke="#1e9b83" strokeWidth="3" /></svg><div className="chart-x"><span>01 Aug</span><span>08 Aug</span><span>15 Aug</span><span>22 Aug</span><span>Today</span></div></div></div><div className="chart-summary"><span><i className="legend-dot sea" /> Verified payments <strong>{summary.data ? `$${summary.data.grossUsdc}` : "—"}</strong></span><span><i className="legend-dot blue" /> Platform fees <strong>N/A</strong></span><span className="chart-summary-note">{summary.data ? "Verified Arc activity" : "Demo visual only · no live transfers yet"}</span></div></div><div className="card flow-card"><div className="card-heading"><div><span className="eyebrow">Settlement rail</span><h3>Payment flow</h3></div></div><div className="simple-flow-list"><div className="simple-flow-row"><div className="simple-flow-num">01</div><div className="simple-flow-info"><strong>Request</strong><small>{summary.data ? `${summary.data.totalCount} intents` : "Ready"}</small></div><span className="simple-flow-tag">Intent</span></div><div className="simple-flow-divider" /><div className="simple-flow-row"><div className="simple-flow-num">02</div><div className="simple-flow-info"><strong>Verify</strong><small>{summary.data ? `${summary.data.successfulCount} verified` : "Instant"}</small></div><span className="simple-flow-tag">Arc L1</span></div><div className="simple-flow-divider" /><div className="simple-flow-row"><div className="simple-flow-num">03</div><div className="simple-flow-info"><strong>Settle</strong><small>{summary.data ? `$${summary.data.availableUsdc} USDC` : "$0.00"}</small></div><span className="simple-flow-tag">Liquid</span></div></div></div></section>
    <section className="lower-grid"><div className="card table-card"><div className="card-heading"><div><span className="eyebrow">Latest activity</span><h3>Recent payments</h3></div><button className="text-button" onClick={() => setActive("Payments")}>View all <ArrowUpRight size={14} /></button></div><PaymentTable compact /></div><div className="card queue-card"><div className="card-heading"><div><span className="eyebrow">Live operations</span><h3>Operations queue</h3></div></div>{summary.data?.pendingCount ? <QueueItem icon={<RefreshCw />} title="Payment verification pending" detail={`${summary.data.pendingCount} intent${summary.data.pendingCount === 1 ? "" : "s"} awaiting Arc confirmation`} action="Open payments" tone="warning" /> : <div className="queue-empty"><ShieldCheck size={17} /><span>No live operations items from verified Arc data.</span></div>}</div></section>
    </div>
  );
}

function Metric({ label, value, delta, positive, icon }: { label: string; value: string; delta: string; positive?: boolean; icon?: React.ReactNode }) { return <div className="metric-card"><div className="metric-top"><span>{label}</span></div><strong>{value}</strong><div className={classNames("metric-delta", positive && "positive")}>{positive && <ArrowUpRight size={13} />}{delta}</div></div>; }
function FlowStep({ n, label, value, done }: { n: string; label: string; value: string; done?: boolean }) { return <div className="flow-step"><span className={classNames("flow-number", done && "flow-done")}>{done ? <Check size={12} /> : n}</span><span><strong>{label}</strong><small>{value}</small></span></div>; }
function QueueItem({ icon, title, detail, action, tone }: { icon: React.ReactNode; title: string; detail: string; action: string; tone: string }) { return <div className="queue-item"><span className={classNames("queue-icon", `queue-${tone}`)}>{icon}</span><span className="queue-copy"><strong>{title}</strong><small>{detail}</small></span><button className="small-link" onClick={() => toast.info(`${action} is available in the full operations console.`)}>{action}</button></div>; }

function PaymentTable({ compact = false }: { compact?: boolean }) {
  const liveQuery = trpc.payments.verifiedPayments.useQuery(undefined, { refetchInterval: 5000 });
  const liveRows = (liveQuery.data ?? []).map(row => ({ id: row.paymentIntentId, customer: row.itemName, amount: `$${(Number(row.amountAtomic) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, status: "Verified", time: new Date(row.finalizedAt ?? row.createdAt ?? Date.now()).toLocaleString(), hash: row.transactionHash, tone: "success", verified: true }));
  const rows = liveRows;
  return <div className="table-wrap"><table><thead><tr><th>Payment</th><th>Customer / item</th><th>Amount</th><th>Status</th><th>Received</th></tr></thead><tbody>{rows.slice(0, compact ? 4 : rows.length).map(row => <tr key={row.id}><td><span className="mono-id">{row.id}</span><small className="table-sub"><span className="mini-arc" />{row.hash}</small></td><td>{row.customer}</td><td className="amount-cell">{row.amount}<small>USDC</small></td><td><StatusPill status={row.status} tone={row.tone} verified={row.verified} txHash={row.hash} /></td><td className="muted-cell">{row.time}</td></tr>)}</tbody></table></div>;
}

function TransactionHistory() {
  const [dateRange, setDateRange] = useState("All dates");
  const [status, setStatus] = useState("All statuses");
  const [method, setMethod] = useState("All methods");
  const [sortKey, setSortKey] = useState<"date" | "amount" | "status" | "method">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const liveQuery = trpc.payments.verifiedPayments.useQuery();
  const liveRows = (liveQuery.data ?? []).map(row => {
    const created = new Date(row.finalizedAt ?? row.createdAt ?? Date.now());
    return { id: row.paymentIntentId, date: created.toISOString().slice(0, 10), time: created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), customer: row.itemName, amount: Number(row.amountAtomic) / 1_000_000, status: "Succeeded", method: "Wallet transfer", hash: row.transactionHash, network: "Arc Testnet", tone: "success" };
  });
  const rows = liveRows;

  const filteredRows = useMemo(() => {
    const filtered = rows.filter(row => {
      const dateMatch = dateRange === "All dates" || (dateRange === "Today" ? row.date === "2026-08-21" : dateRange === "Last 7 days" ? row.date >= "2026-08-15" : row.date >= "2026-08-01");
      return dateMatch && (status === "All statuses" || row.status === status) && (method === "All methods" || row.method === method);
    });
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortKey === "amount") comparison = a.amount - b.amount;
      else if (sortKey === "date") comparison = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
      else if (sortKey === "status") comparison = a.status.localeCompare(b.status);
      else comparison = a.method.localeCompare(b.method);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [dateRange, status, method, sortKey, sortDirection, liveQuery.data]);

  const updateSort = (key: "date" | "amount" | "status" | "method") => {
    if (sortKey === key) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "date" ? "desc" : "asc"); }
  };
  const reset = () => { setDateRange("All dates"); setStatus("All statuses"); setMethod("All methods"); };
  const sortIcon = (key: string) => sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕";

  return <>
    <div className="transaction-toolbar">
      <div className="filter-control"><label>Date range</label><select value={dateRange} onChange={e => setDateRange(e.target.value)}><option>All dates</option><option>Today</option><option>Last 7 days</option><option>This month</option></select></div>
      <div className="filter-control"><label>Status</label><select value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option><option>Succeeded</option><option>Verifying</option><option>Underpaid</option><option>Risk review</option><option>Expired</option></select></div>
      <div className="filter-control"><label>Payment method</label><select value={method} onChange={e => setMethod(e.target.value)}><option>All methods</option><option>Wallet transfer</option><option>Hosted checkout</option><option>Payment link</option><option>API</option></select></div>
      <button className="button button-quiet reset-filter" onClick={reset}><RefreshCw size={14} /> Reset</button>
    </div>
    <div className="history-summary"><span><strong>{filteredRows.length}</strong> of {rows.length} transactions</span></div>
    <div className="card table-card full-table transaction-table"><div className="table-wrap"><table><thead><tr><th><button className="sort-button" onClick={() => updateSort("date")}>Date / time <span>{sortIcon("date")}</span></button></th><th>Transaction</th><th>Customer</th><th><button className="sort-button" onClick={() => updateSort("amount")}>Amount <span>{sortIcon("amount")}</span></button></th><th><button className="sort-button" onClick={() => updateSort("status")}>Status <span>{sortIcon("status")}</span></button></th><th><button className="sort-button" onClick={() => updateSort("method")}>Payment method <span>{sortIcon("method")}</span></button></th><th /></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id} onClick={() => setSelectedId(row.id)} className="clickable-row"><td><strong>{row.date}</strong><small className="table-sub">{row.time}</small></td><td><span className="mono-id">{row.id}</span><small className="table-sub"><span className="mini-arc" />{row.hash}</small></td><td>{row.customer}</td><td className="amount-cell">${row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}<small>USDC</small></td><td><StatusPill status={row.status} tone={row.tone} /></td><td><span className="method-label"><span className="method-glyph">{row.method === "API" ? "{/}" : row.method === "Payment link" ? "↗" : row.method === "Hosted checkout" ? "□" : "⌁"}</span>{row.method}</span></td><td><button className="icon-button" aria-label={`Open ${row.id}`} onClick={e => { e.stopPropagation(); setSelectedId(row.id); }}><ArrowUpRight size={15} /></button></td></tr>)}</tbody></table>{filteredRows.length === 0 && <div className="history-empty"><div className="empty-icon"><Search size={19} /></div><h3>{liveRows.length === 0 ? "No verified Arc transfers yet" : "No matching transactions"}</h3><p>{liveRows.length === 0 ? "Complete a real Arc Testnet USDC checkout and the verified payment will appear here." : "Try widening the date range or resetting one of the filters."}</p><button className="button button-quiet" onClick={reset}>Reset filters</button></div>}</div></div>
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
          title: "Balances",
          badge: "Treasury Ledger",
          icon: <WalletCards size={18} className="text-[var(--primary)]" />,
          summary: "Real-time ledger of available, pending, and liquid USDC balances held in your merchant recipient address.",
          points: [
            "Available Balance: Real-time onchain USDC funds ready for immediate merchant transfer or payout.",
            "Pending Balance: Unconfirmed transactions currently awaiting miner inclusion or validation.",
            "Multi-Asset Ready: Structured for Arc native USDC with future support for multi-chain stablecoins."
          ],
          tip: "Funds in your merchant wallet belong solely to you—Druto is non-custodial and holds zero client funds."
        },
        {
          title: "Settlements",
          badge: "Direct Routing",
          icon: <Send size={18} className="text-[var(--primary)]" />,
          summary: "Non-custodial payout coordination and multi-seller marketplace cart splitting logic.",
          points: [
            "Zero Intermediate Custody: Money moves wallet-to-wallet directly from buyer to merchant recipient.",
            "Multi-Seller Parallel Splits: For marketplace carts containing items from multiple merchants, Druto handles clean parallel disbursements.",
            "Settlement Audit Logs: Trace every fee split and merchant disbursement with exact transaction references."
          ],
          tip: "Multi-seller cart splitting eliminates complex escrow and escrow licensing overhead."
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
          title: "Risk & compliance",
          badge: "Security Engine",
          icon: <ShieldCheck size={18} className="text-[var(--primary)]" />,
          summary: "Transaction heuristics, sanctioned address filtering, velocity controls, and single-use intent verification.",
          points: [
            "Replay Protection: Cryptographic intent nonces ensure each checkout session can only be submitted once.",
            "Contract Conformance: Strictly validates transfers against the official Arc Testnet USDC contract (0x3600...).",
            "Destination Allowlisting: Prevents rogue payments by enforcing verified merchant destination addresses.",
            "Review Queue: Flags anomalous velocity spikes or address mismatches for operator review."
          ],
          tip: "Allowlist protection ensures buyers can never be tricked into sending funds to unapproved addresses."
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
            style={{ padding: "6px 14px", fontSize: "12.5px" }}
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="button button-quiet"
            style={{ padding: "6px 14px", fontSize: "12.5px" }}
          >
            Minimize all
          </button>
          <a className="button button-quiet" href="/developers" target="_blank" rel="noreferrer">
            <Code2 size={15} /> Developer Docs
          </a>
          <a className="button button-primary" href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> ArcScan Explorer
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
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 750, color: "var(--foreground)" }}>
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
                        <p style={{ fontSize: "13.5px", color: "var(--foreground)", lineHeight: "1.6", marginBottom: "16px" }}>
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
                                fontSize: "12.5px", 
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
          <span style={{ fontSize: "12.5px", color: "var(--muted-foreground)" }}>Our engineering team assists with multi-seller contract verification, SDK setup, and custom marketplace deployments.</span>
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

function SettingsPage({
  moduleToggles,
  onToggleModule,
  user,
}: {
  moduleToggles: ModuleToggles;
  onToggleModule: (key: keyof ModuleToggles, val: boolean) => void;
  user: { name?: string | null; openId?: string | null; email?: string | null };
}) {
  const modulesList: Array<{
    key: keyof ModuleToggles;
    name: string;
    group: string;
    icon: any;
    description: string;
  }> = [
    {
      key: "paymentLinks",
      name: "Payment Links",
      group: "Operate",
      icon: Link2,
      description: "Generate instant hosted checkout links for direct Arc USDC payments without an integrated shopping cart.",
    },
    {
      key: "invoices",
      name: "Invoices",
      group: "Operate",
      icon: ReceiptText,
      description: "Create and dispatch onchain payment requests with line-item totals, tax calculation, and Arc receipts.",
    },
    {
      key: "subscriptions",
      name: "Subscriptions",
      group: "Operate",
      icon: RefreshCw,
      description: "Manage recurring billing schedules, customer subscription lifecycles, and automated settlement streams.",
    },
    {
      key: "reports",
      name: "Reports",
      group: "Understand",
      icon: Table2,
      description: "Export financial summaries, audited ledger reconciliations, CSV balance statements, and tax reports.",
    },
  ];

  return (
    <div className="page-content">
      <div className="page-header" style={{ marginBottom: "20px" }}>
        <div>
          <h2>Settings</h2>
        </div>
      </div>

      <div className="settings-section">
        <div className="card settings-card">
          <div className="settings-card-head">
            <div>
              <span className="eyebrow">Sidebar navigation</span>
              <h3>Optional Dashboard Modules</h3>
            </div>
          </div>

          <div className="module-toggle-list">
            {modulesList.map(({ key, name, group, icon: Icon, description }) => {
              const isEnabled = moduleToggles[key];
              return (
                <div
                  key={key}
                  className={classNames("module-toggle-item", isEnabled && "is-enabled")}
                >
                  <div className="module-toggle-left">
                    <div className="module-toggle-icon">
                      <Icon size={18} />
                    </div>
                    <div className="module-toggle-text">
                      <strong>
                        {name}
                        <span className="module-group-tag">{group}</span>
                      </strong>
                      <small>{description}</small>
                    </div>
                  </div>
                  <label className="ui-switch" aria-label={`Toggle ${name}`}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => onToggleModule(key, e.target.checked)}
                    />
                    <span className="ui-switch-slider" />
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card settings-card">
          <div className="settings-card-head">
            <div>
              <h3>Network Configuration</h3>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="p-3 border rounded-lg bg-background/50">
              <span className="text-xs text-muted-foreground block">Active Network</span>
              <strong className="text-sm font-semibold text-foreground flex items-center gap-1.5 mt-1">
                <span className="live-dot" /> Arc Testnet
              </strong>
            </div>
            <div className="p-3 border rounded-lg bg-background/50">
              <span className="text-xs text-muted-foreground block">EVM Chain ID</span>
              <strong className="text-sm font-semibold font-mono text-foreground mt-1 block">5042002</strong>
            </div>
            <div className="p-3 border rounded-lg bg-background/50">
              <span className="text-xs text-muted-foreground block">Settlement Asset</span>
              <strong className="text-sm font-semibold text-primary mt-1 block">Native USDC</strong>
            </div>
            <div className="p-3 border rounded-lg bg-background/50">
              <span className="text-xs text-muted-foreground block">RPC Verification</span>
              <strong className="text-sm font-semibold text-emerald-700 mt-1 block">Operational</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PagePanel({
  active,
  onCreate,
  moduleToggles,
  onToggleModule,
  user,
}: {
  active: string;
  onCreate: () => void;
  moduleToggles: ModuleToggles;
  onToggleModule: (key: keyof ModuleToggles, val: boolean) => void;
  user: { name?: string | null; openId?: string | null; email?: string | null };
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const headings: Record<string, string> = { Payments: "Payments", "Payment Links": "Payment Links", Invoices: "Invoices", Subscriptions: "Subscriptions", Customers: "Customers", Balances: "Balances", Settlements: "Settlements", Reports: "Reports", "Risk & compliance": "Risk & compliance", Developers: "Developers", "API Keys": "API Keys", Settings: "Settings", Support: "Support & Guides" };
  const title = headings[active] || active;
  if (active === "Support") return <SupportGuidelinesPage />;
  if (active === "Settings") return <SettingsPage moduleToggles={moduleToggles} onToggleModule={onToggleModule} user={user} />;
  if (active === "Payments") return <div className="page-content"><PageHeader eyebrow="Ledger activity" title="Transaction history" description="Every payment intent, observed transaction, and final ledger posting in one place." action="Create payment" onAction={onCreate} /><TransactionHistory /></div>;
  if (active === "Balances") return <BalancesPage />;
  if (active === "Settlements") return <SettlementsPage />;
  if (active === "Risk & compliance") return <RiskPage />;
  if (active === "Developers") return <DeveloperIntegrationPage />;
  if (active === "API Keys") return <SellerOnboarding />;
  if (active === "Customers") return <CustomersPage />;
  return (
    <div className="page-content">
      <PageHeader title={title} action={active === "Settlements" ? "Request settlement" : "Create new"} onAction={onCreate} />
      <div className="empty-feature card">
        <h3>{title} workspace</h3>
        <div className="empty-actions">
          <button className="button button-primary" onClick={onCreate}>
            <Plus size={16} /> {active === "Settlements" ? "Request settlement" : "Create record"}
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
function BalancesPage() { const summary = trpc.payments.summary.useQuery(); return <div className="page-content"><PageHeader title="Balances" action="View payments" onAction={() => window.location.href = "/payments"} /><div className="balance-hero card"><div><span className="eyebrow">Available USDC</span><strong>${summary.data?.availableUsdc ?? "0.00"}</strong><p><span className="live-dot" /> Arc Testnet · verified onchain transfers</p></div><img src={settleVisual} alt="Settlement abstraction" /></div><div className="balance-grid"><Metric label="Available" value={`$${summary.data?.availableUsdc ?? "0.00"}`} delta="Verified USDC" positive icon={<Check size={14} />} /><Metric label="Pending" value={`$${summary.data?.pendingUsdc ?? "0.00"}`} delta={`${summary.data?.pendingCount ?? 0} intents`} icon={<Timer size={14} />} /><Metric label="Reserved" value="N/A" delta="Not configured in direct-wallet demo" icon={<LockKeyhole size={14} />} /></div><div className="card table-card"><div className="card-heading"><div><span className="eyebrow">Verified movements</span><h3>Recent Arc transfers</h3></div><button className="text-button" onClick={() => toast.info("CSV export will be added with the reporting API.")}>Export CSV <ArrowDownRight size={14} /></button></div><PaymentTable compact /></div></div>; }
function SettlementsPage() { const summary = trpc.payments.summary.useQuery(); const verified = trpc.payments.verifiedPayments.useQuery(); return <div className="page-content"><PageHeader title="Settlements" action="Review payments" onAction={() => window.location.href = "/payments"} /><div className="balance-hero card"><div><span className="eyebrow">Ready to settle</span><strong>${summary.data?.availableUsdc ?? "0.00"}</strong><p><span className="live-dot" /> Arc Testnet · payout execution disabled</p></div><img src={settleVisual} alt="Settlement abstraction" /></div><div className="balance-grid"><Metric label="Verified gross" value={`$${summary.data?.grossUsdc ?? "0.00"}`} delta={`${verified.data?.length ?? 0} transfers`} positive icon={<Check size={14} />} /><Metric label="Pending" value={`$${summary.data?.pendingUsdc ?? "0.00"}`} delta="Awaiting verification" icon={<Timer size={14} />} /><Metric label="Platform fees" value="N/A" delta="No fee ledger configured" icon={<LockKeyhole size={14} />} /></div><div className="card empty-feature"><h3>No payout execution yet</h3><p>Druto can verify the buyer’s direct USDC transfer and show the merchant’s verified balance. Settlement movement will be added after the ledger, compliance, and payout policy layers are approved.</p></div></div>; }
function RiskPage() { return <div className="page-content"><PageHeader title="Risk & compliance" action="View allowlist" onAction={() => toast.info("Allowlist monitoring is active across all registered seller destinations.")} /><div className="risk-banner"><ShieldCheck size={21} /><div><strong>Compliance engine active on Arc Testnet</strong><span>Direct-to-wallet transactions are screened against official ERC-20 contract specifications.</span></div><StatusPill status="Active" tone="success" /></div><div className="risk-layout"><div className="card table-card"><div className="card-heading"><div><span className="eyebrow">Review queue</span><h3>Open risk cases</h3></div><span className="queue-count">0</span></div><div className="queue-empty"><ShieldCheck size={17} /><span>No policy violations or risk holds detected. All registered seller workspaces are in good standing.</span></div></div><div className="card controls-card"><span className="eyebrow">Policy snapshot</span><h3>Guardrails & settlement rules</h3><Policy label="Merchant status" value="Active" ok /><Policy label="Destination allowlist" value="Enforced" ok /><Policy label="Arc token verification" value="USDC (0x3600...)" ok /><Policy label="Single-use intent nonces" value="Active" ok /></div></div></div>; }
function Policy({ label, value, ok }: { label: string; value: string; ok?: boolean }) { return <div className="policy-row"><span>{ok ? <Check size={14} /> : <AlertTriangle size={14} />}{label}</span><strong>{value}</strong></div>; }
function SellerOwnershipDemo() { return <div className="card p-6 mt-6"><div className="flex items-start gap-3"><ShieldCheck size={20} /><div><span className="eyebrow">Seller activation</span><h3 className="mt-2">Wallet verification is paused</h3><p className="mt-2 text-muted-foreground">Seller records, payment destinations, API keys, and signed webhooks remain available. Wallet ownership verification will be restored later as a separate integration module.</p></div></div></div>; }
function DeveloperIntegrationPage() { const [copied, setCopied] = useState<string | null>(null); const snippet = developerSdkSnippet; const copy = (value: string, key: string) => { navigator.clipboard?.writeText(value); setCopied(key); toast.success("Code copied"); }; return <div className="page-content"><PageHeader title="Developer kit" action="Open marketplace demo" onAction={() => window.location.href = "/marketplace"} /><div className="card p-6 md:p-8" style={{ background: "linear-gradient(135deg, #e8f5ee 0%, #f7f8f1 55%, #eaf0ff 100%)" }}><div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr] items-center"><div><span className="eyebrow">Druto Payment Kit</span><h2 className="text-3xl md:text-4xl font-semibold mt-3 max-w-xl">One integration surface for checkout, settlement, and receipts.</h2><p className="mt-4 max-w-2xl text-muted-foreground">Use the SDK for the buyer-facing handoff and the Payment Intent API for server-side order creation. Druto hosts the payment window; your site keeps control of the cart, fulfillment, and return experience.</p><div className="flex flex-wrap gap-3 mt-6"><button className="button button-primary" onClick={() => document.getElementById("sdk-quickstart")?.scrollIntoView({ behavior: "smooth" })}><Code2 size={16} /> View quickstart</button><button className="button button-quiet" onClick={() => toast.info("SDK package publishing is planned; use the contract below for the current demo integration.")}><BookOpen size={16} /> Read contract</button></div></div><div className="rounded-2xl bg-white/75 border border-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="eyebrow">Supported demo rail</span><span className="status-pill success">Ready</span></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="mini-card"><small>Network</small><strong>Arc Testnet</strong></div><div className="mini-card"><small>Asset</small><strong>USDC</strong></div><div className="mini-card"><small>Buyer UX</small><strong>Wallet + QR</strong></div><div className="mini-card"><small>Return</small><strong>Receipt URL</strong></div></div></div></div></div><div id="sdk-quickstart" className="developer-grid mt-6"><div className="card code-card"><div className="card-heading"><div><span className="eyebrow">SDK quickstart</span><h3>Embed the hosted checkout</h3></div><button className="small-link" onClick={() => copy(snippet, "sdk")}>{copied === "sdk" ? "Copied" : "Copy code"}</button></div><pre className="code-block whitespace-pre-wrap overflow-auto"><code>{snippet}</code></pre><p className="code-note"><InfoDot /> The SDK snippet opens the hosted Druto checkout. Keep secret API credentials on your server; never ship them in browser code.</p></div><div className="card endpoint-card"><span className="eyebrow">Integration flow</span><h3>Six steps to go live</h3><div className="mt-4 space-y-4"><div className="flex gap-3"><span className="queue-count">01</span><span><strong>Register the seller</strong><small>Provide the marketplace seller ID and intended Arc receiving wallet.</small></span></div><div className="flex gap-3"><span className="queue-count">02</span><span><strong>Sign ownership challenge</strong><small>Use the seller wallet to sign a domain-bound message; no funds move.</small></span></div><div className="flex gap-3"><span className="queue-count">03</span><span><strong>Create an intent</strong><small>Send amount, order, buyer, and return context from your server.</small></span></div><div className="flex gap-3"><span className="queue-count">04</span><span><strong>Open Druto</strong><small>Redirect the buyer to the hosted wallet and QR payment window.</small></span></div><div className="flex gap-3"><span className="queue-count">05</span><span><strong>Verify transfer</strong><small>Wait for Arc finality and consume the verified payment event.</small></span></div><div className="flex gap-3"><span className="queue-count">06</span><span><strong>Fulfill and reconcile</strong><small>Match the external order ID to the buyer receipt and ledger row.</small></span></div></div></div></div><div className="grid gap-6 lg:grid-cols-2 mt-6"><div className="card p-6"><span className="eyebrow">Payment Intent contract</span><h3 className="mt-2">Server request</h3><pre className="code-block mt-4 whitespace-pre-wrap overflow-auto"><code>{`POST /api/trpc/payments.createIntent\n\n{\n  externalOrderId: "order_123",\n  idempotencyKey: "order_123-v1",\n  itemName: "Arc Testnet Starter × 1",\n  amount: "1.00",\n  buyerLabel: "buyer@example.com",\n  returnUrl: "https://shop.example/paid",\n  orderContext: {\n    items: [{ productId, name, seller, unitPrice, quantity }],\n    delivery, shippingAddress, buyerEmail\n  }\n}`}</code></pre></div><div className="card p-6"><span className="eyebrow">Production checklist</span><h3 className="mt-2">What your team owns</h3><div className="mt-4 space-y-3"><Policy label="Keep API credentials server-side" value="Required" ok /><Policy label="Use a unique idempotency key per order" value="Required" ok /><Policy label="Verify Arc transaction finality before fulfillment" value="Required" ok /><Policy label="Persist buyer return and order context" value="Recommended" ok /><Policy label="Use the demo fallback only for rehearsals" value="Test only" /></div></div></div><div className="developer-links mt-6"><div><WalletCards size={18} /><strong>Hosted checkout</strong><span>Buyers return through the hosted payment flow when the settlement rail is enabled.</span></div><div><ShieldCheck size={18} /><strong>Safe payment states</strong><span>Ready, submitted, verified, expired, and mismatch states are explicit in the flow.</span></div><div><GitBranch size={18} /><strong>Sandbox to production</strong><span>Start on Arc Testnet with USDC, then replace the environment configuration after operational review.</span></div></div><SellerOwnershipDemo /><div className="card p-6 mt-6"><div className="flex items-start gap-3"><AlertTriangle size={18} /><div><strong>Current project status</strong><p className="mt-1 text-muted-foreground">This Druto demo has the real Arc Testnet verification foundation and merchant-wallet transfer flow. The SDK package shown here is an integration contract and starter pattern; package publishing, production API authentication, webhooks, and automated fulfillment remain the next backend release steps.</p></div></div></div></div> }
function DeveloperPage() { const [copied, setCopied] = useState(false); return <div className="page-content"><PageHeader title="Developers" action="Create API key" onAction={() => toast.info("API key creation is intentionally deferred until the backend is connected.")} /><div className="developer-grid"><div className="card code-card"><div className="card-heading"><div><span className="eyebrow">Quickstart</span><h3>Create a payment intent</h3></div><Terminal size={18} /></div><div className="code-block"><div className="code-top"><span><i /> test request</span><button onClick={() => { setCopied(true); toast.success("Code copied"); }}><Copy size={13} /> {copied ? "Copied" : "Copy"}</button></div><pre><code>{`curl https://api.druto.example/v1/payment_intents \\\n  -H "Authorization: Bearer druto_test_..." \\\n  -H "Idempotency-Key: order_123" \\\n  -d amount=100000000 \\\n  -d asset=USDC \\\n  -d network=arc`}</code></pre></div><div className="code-note"><InfoDot /> API, auth, and idempotency are represented here as documentation only. No request is sent.</div></div><div className="card endpoint-card"><span className="eyebrow">Integration status</span><h3>Connection map</h3><Endpoint icon={<GitBranch />} label="REST API" status="Deferred" /><Endpoint icon={<Network />} label="Arc Testnet" status="Deferred" /><Endpoint icon={<WalletCards />} label="Circle Wallets" status="Deferred" /><Endpoint icon={<ShieldCheck />} label="Webhook signing" status="Designed" /></div></div><div className="developer-links"><div><Code2 size={18} /><strong>API reference</strong><span>Resources, errors, and idempotency model</span></div><div><FileCheck2 size={18} /><strong>Integration checklist</strong><span>What must be verified before production</span></div><div><LockKeyhole size={18} /><strong>Security guide</strong><span>Keys, scopes, and replay protection</span></div></div></div>; }
function InfoDot() { return <span className="info-dot">i</span>; }
function Endpoint({ icon, label, status }: { icon: React.ReactNode; label: string; status: string }) { return <div className="endpoint-row"><span className="endpoint-icon">{icon}</span><span><strong>{label}</strong><small>Adapter boundary</small></span><StatusPill status={status} tone={status === "Designed" ? "success" : "neutral"} /></div>; }
function CustomersPage() {
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
  return <div className="page-content"><PageHeader title="Customers" action="Refresh buyers" onAction={() => void verified.refetch()} /><div className="filter-bar"><div className="search-field wide"><Search size={15} /><input placeholder="Search verified buyers" aria-label="Search verified buyers" /></div><button className="filter-button" onClick={() => toast.info("Buyer filters are coming with the reporting API.")}><ListFilter size={15} /> Filters</button></div>{!customers.length ? <div className="card empty-feature"><h3>No verified buyers yet</h3><p>Complete an Arc Testnet USDC payment from a customer wallet to populate this workspace.</p></div> : <div className="card table-card full-table"><table><thead><tr><th>Buyer</th><th>Contact</th><th>Payment volume</th><th>Payments</th><th>Status</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.name}><td><div className="customer-cell"><div className="avatar small">{customer.name.slice(0, 2).toUpperCase()}</div><strong>{customer.name}</strong></div></td><td className="muted-cell">{customer.email}</td><td className="amount-cell">${customer.volume.toFixed(2)}<small>USDC</small></td><td>{customer.payments}</td><td><StatusPill status="Verified" tone="success" /></td></tr>)}</tbody></table></div>}</div>;
}
function DetailDrawer({ id, close }: { id: string; close: () => void }) {
  const intentQuery = trpc.payments.getIntent.useQuery({ id });
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
          <a className="button button-primary full-width" href={`https://testnet.arcscan.app/tx/${intent.transactionHash}`} target="_blank" rel="noreferrer" style={{ marginTop: "1rem" }}>
            <ExternalLink size={15} /> View on ArcScan Explorer
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

function ReceiptPage() {
  const [location] = useLocation();
  const pathname = typeof window !== "undefined" ? window.location.pathname : location.split("?")[0];
  const intentId = pathname.split("/").filter(Boolean).pop() || "";
  const receiptPreview = new URLSearchParams(typeof window !== "undefined" ? window.location.search : location.split("?")[1] ?? "").get("demo") === "mixed-receipt";
  const utils = trpc.useUtils();
  const query = trpc.payments.getIntent.useQuery(
    { id: intentId },
    { enabled: Boolean(intentId) && !receiptPreview, refetchInterval: (query) => (query.state.data?.status === "succeeded" ? false : 3000) }
  );
  const verifyTransfer = trpc.payments.verifyTransfer.useMutation();
  const [manualHash, setManualHash] = useState("");
  const [isVerifyingManual, setIsVerifyingManual] = useState(false);

  const [paymentQueue] = useState<MarketplacePaymentQueue | null>(() => { try { if (receiptPreview) return { orderId: "DR-MULTI-PREVIEW", intentIds: ["preview-intent-a", "preview-intent-b"], checkoutUrls: ["/receipt/preview-intent-a?demo=mixed-receipt", "/receipt/preview-intent-b?demo=mixed-receipt"], sellerNames: ["Druto Labs", "Mosaic Works"] }; const saved = window.localStorage.getItem(MARKETPLACE_PAYMENT_QUEUE_KEY); return saved ? JSON.parse(saved) as MarketplacePaymentQueue : null; } catch { return null; } });
  const previewSeller = intentId === "preview-intent-b" ? { name: "Mosaic Works", productId: "ledger-kit", itemName: "Ledger Operations Kit", amountAtomic: "2500000", sellerId: "mosaic-works" } : { name: "Druto Labs", productId: "api-pro", itemName: "Arc API Pro", amountAtomic: "1000000", sellerId: "druto-labs" };
  const previewOrderContext = JSON.stringify({ items: [{ productId: previewSeller.productId, name: previewSeller.itemName, seller: previewSeller.name, unitPrice: Number(previewSeller.amountAtomic) / 1_000_000, quantity: 1 }], delivery: "Digital delivery", shippingAddress: { name: "Alex Rivera", line1: "1 Main St", city: "Arc City", postalCode: "10001", country: "United States" }, buyerEmail: "buyer@example.com" });
  const previewIntent = { id: intentId, externalOrderId: `DR-MULTI-PREVIEW-${previewSeller.sellerId}`, marketplaceId: "druto-demo-marketplace", sellerId: previewSeller.sellerId, merchantAccountId: `legacy-demo-${previewSeller.sellerId}`, idempotencyKey: `preview-${previewSeller.sellerId}`, itemName: previewSeller.itemName, buyerLabel: "buyer@example.com", returnUrl: "/marketplace", orderContext: previewOrderContext, amountAtomic: previewSeller.amountAtomic, asset: "USDC", network: "arc-testnet", merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217", buyerAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", status: "succeeded", transactionHash: "0x3f7a18b9c6f2e8319e7a8f94cb44d32e185c7210e3954f9a0c3b84a9235d72f1", expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date() } as NonNullable<typeof query.data>;
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

  if (!intent) return <div className="checkout-shell"><div className="checkout-brand"><Mark /><span>druto</span></div><main className="checkout-main"><div className="checkout-card"><strong>Loading buyer receipt…</strong></div></main></div>;
  const { amount, isSucceeded, orderContext, lineItems, buyerEmail, shipping } = buildReceiptSummary(intent);
  const statusLabel = isSucceeded ? "Payment Receipt" : "Verification in progress";
  const copyValue = async (value: string, label: string) => { const copied = await copyReceiptValue(value); if (copied) toast.success(`${label} copied`); else toast.info(`Select and copy the ${label.toLowerCase()} manually.`); };

  return (
    <div className="checkout-shell">
      <div className="checkout-brand">
        <Mark />
        <span>druto</span>
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
            <span><ReceiptText size={14} /> Order context preserved</span>
          </div>
          <div className="receipt-side-actions">
            <button className="button button-quiet receipt-print" onClick={() => window.print()}>
              <Printer size={14} /> Save or print receipt
            </button>
            {intent.transactionHash ? (
              <a
                className="button button-primary receipt-side-btn"
                href={`https://testnet.arcscan.app/tx/${intent.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> View on ArcScan Explorer
              </a>
            ) : (
              <a
                className="button button-quiet receipt-side-btn"
                href={`https://testnet.arcscan.app/address/${intent.merchantAddress}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} /> View Merchant on ArcScan Explorer
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
              <span className="eyebrow">Order</span>
              <strong>{intent.externalOrderId}</strong>
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

          <section className="receipt-section receipt-meta-grid">
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
          </section>

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
              <p style={{ fontSize: "11px", color: "#636e72", margin: "0 0 8px" }}>
                Paste the Arc transaction hash from your wallet or ArcScan to instantly finalize verification.
              </p>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type="text"
                  placeholder="0x..."
                  value={manualHash}
                  onChange={e => setManualHash(e.target.value)}
                  style={{ flex: 1, padding: "6px 8px", fontSize: "11px", border: "1px solid #ced6e0", borderRadius: "6px" }}
                />
                <button
                  className="button button-primary"
                  onClick={handleManualVerify}
                  disabled={isVerifyingManual || !manualHash.trim()}
                  style={{ fontSize: "11px", padding: "0 10px", height: "30px" }}
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
  const intentQuery = trpc.payments.getIntent.useQuery({ id: intentId }, { enabled: Boolean(intentId) });
  const verifyTransfer = trpc.payments.verifyTransfer.useMutation();
  const intent = intentQuery.data;
  const amountDisplay = intent ? (Number(intent.amountAtomic) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";

  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const isArc = chainId === ARC_CHAIN_ID;
  const isSucceeded = intent?.status === "succeeded";

  const updateBalance = async (addr: `0x${string}`) => {
    try {
      const bal = await fetchArcUsdcBalance(addr);
      setUsdcBalance(bal);
    } catch {
      setUsdcBalance("0.00");
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
                blockExplorerUrls: ["https://testnet.arcscan.app"],
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
    if (!intent) return;
    if (!address) {
      await connectWallet();
      return;
    }
    if (!isArc) {
      await switchToArc();
      return;
    }

    setPaying(true);
    try {
      const data = encodeArcUsdcTransfer(intent.merchantAddress as `0x${string}`, intent.amountAtomic);
      const hash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: ARC_USDC_ADDRESS,
            data,
          },
        ],
      });

      setTxHash(hash);
      setPaying(false);
      setVerifying(true);
      toast.info("Transaction broadcast. Verifying on Arc Testnet…");

      const result = await verifyTransfer.mutateAsync({
        paymentIntentId: intent.id,
        transactionHash: hash,
      });

      toast.success("Payment verified onchain!");
      window.location.href = `/receipt/${intent.id}`;
    } catch (err: any) {
      setPaying(false);
      setVerifying(false);
      toast.error(err?.message || "Payment transaction failed or was rejected");
    }
  };

  return (
    <div className="checkout-shell">
      <div className="checkout-brand">
        <Mark />
        <span>druto</span>
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
            <span>Order #{(intent?.externalOrderId ?? intentId) || "pending"}</span>
            <span className="checkout-expiry">
              <Timer size={14} /> {intent ? "Item: " + intent.itemName : "Intent unavailable"}
            </span>
          </div>

          <div className="checkout-amount">
            <span>Total due</span>
            <strong>{"$" + amountDisplay} <small>USDC</small></strong>
          </div>

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
                <strong style={{ color: Number(usdcBalance ?? 0) < Number(intent ? Number(intent.amountAtomic) / 1_000_000 : 0) ? "#e17055" : "#1e9b83" }}>
                  {usdcBalance !== null ? `${usdcBalance} USDC` : "Loading…"}
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
              {!address ? (
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


function DashboardWorkspace({ user }: { user: { name?: string | null; openId?: string | null; email?: string | null } }) {
  const [location] = useLocation();
  const [active, setActive] = useState(location.startsWith("/payments") ? "Payments" : "Overview");
  const [collapsed, setCollapsed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [moduleToggles, setModuleToggles] = useState<ModuleToggles>(getStoredModuleToggles);

  const handleToggleModule = (key: keyof ModuleToggles, val: boolean) => {
    const updated = { ...moduleToggles, [key]: val };
    setModuleToggles(updated);
    saveStoredModuleToggles(updated);
    const labels: Record<keyof ModuleToggles, string> = {
      paymentLinks: "Payment Links",
      invoices: "Invoices",
      subscriptions: "Subscriptions",
      reports: "Reports",
    };
    toast.success(`${labels[key]} ${val ? "added to sidebar" : "removed from sidebar"}`);
  };

  const title = active === "Overview" ? "Overview" : active;
  const create = () => setShowCreate(true);
  return (
    <div className="app-shell">
      <Sidebar
        active={active}
        setActive={setActive}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        user={user}
        moduleToggles={moduleToggles}
      />
      <main className="main-shell">
        <Topbar title={title} onCreate={create} />
        {active === "Overview" ? (
          <Overview setActive={setActive} onCreate={create} />
        ) : (
          <PagePanel
            active={active}
            onCreate={create}
            moduleToggles={moduleToggles}
            onToggleModule={handleToggleModule}
            user={user}
          />
        )}
      </main>
      {showCreate && <CreatePayment close={() => setShowCreate(false)} />}
    </div>
  );
}

function DashboardAccess() {
  const session = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const privyLogin = trpc.auth.privyLogin.useMutation();
  const utils = trpc.useUtils();
  const [privyExchangeState, setPrivyExchangeState] = useState<"idle" | "loading" | "error">("idle");

  let privy: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    privy = usePrivy();
  } catch {
    privy = null;
  }

  const privyReady = privy?.ready;
  const privyAuthenticated = privy?.authenticated;
  const getAccessToken = privy?.getAccessToken;

  useEffect(() => {
    if (!privyReady || !privyAuthenticated || session.data || privyExchangeState !== "idle" || !getAccessToken) return;
    let active = true;
    setPrivyExchangeState("loading");
    void getAccessToken().then(async (accessToken: string | null) => {
      if (!active) return;
      if (!accessToken) {
        setPrivyExchangeState("error");
        return;
      }
      try {
        await privyLogin.mutateAsync({ accessToken });
        await utils.auth.me.invalidate();
      } catch (error) {
        if (active) {
          setPrivyExchangeState("error");
          toast.error(error instanceof Error ? error.message : "Privy session could not be established");
        }
      }
    });
    return () => { active = false; };
  }, [getAccessToken, privyAuthenticated, privyReady, privyExchangeState, session.data, utils.auth.me, privyLogin]);

  const waitingForPrivy = privyAuthenticated && !session.data && privyExchangeState !== "error";
  if (session.isLoading || privyExchangeState === "loading" || waitingForPrivy) {
    return (
      <div className="dashboard-loading">
        <Mark />
        <div className="auth-spinner" aria-hidden="true" />
        <strong>Loading Druto workspace…</strong>
        <span>{privyAuthenticated ? "Finishing secure sign-in with Privy." : "Verifying your sign-in session."}</span>
      </div>
    );
  }

  if (!session.data || dashboardAccessState(session.data) !== "workspace") {
    return <AccountLoginCard />;
  }

  return <DashboardWorkspace user={session.data} />;
}

export default function Home() { const [location] = useLocation(); if (location.startsWith("/receipt")) return <ReceiptPage />; if (location.startsWith("/checkout")) return <CheckoutPage />; return <DashboardAccess />; }
function CreatePayment({ close }: { close: () => void }) {
  const [amount, setAmount] = useState("1.00");
  const [orderId, setOrderId] = useState("DR-1842");
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
