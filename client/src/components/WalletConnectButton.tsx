import React, { useState } from "react";
import { Wallet, ExternalLink, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ARC_CHAIN_ID, CIRCLE_FAUCET_URL, ARC_USDC_ADDRESS } from "@/lib/arcChain";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { erc20Abi } from "@/lib/arcChain";

export default function WalletConnectButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect({
    mutation: {
      onSuccess: () => {
        toast.success("Wallet connected");
      },
      onError: (err) => {
        toast.error(err.message || "Failed to connect wallet");
      },
    }
  });
  const { disconnect } = useDisconnect({
    mutation: {
      onSuccess: () => {
        toast.info("Wallet disconnected");
        setMenuOpen(false);
      }
    }
  });
  const { switchChain } = useSwitchChain({
    mutation: {
      onSuccess: () => toast.success("Switched to Arc Testnet"),
      onError: () => toast.error("Could not switch network to Arc Testnet"),
    }
  });

  const { data: rawBalance, refetch: refreshBalance } = useReadContract({
    address: ARC_USDC_ADDRESS as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 10000,
    }
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [showWalletList, setShowWalletList] = useState(false);
  const [copied, setCopied] = useState(false);

  const isArc = chainId === ARC_CHAIN_ID;
  const usdcBalance = typeof rawBalance === "bigint" ? Number(formatUnits(rawBalance, 6)).toFixed(2) : "0.00";

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected || !address) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          className="button button-quiet"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            height: "34px",
            padding: "0 12px",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: "6px",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 500
          }}
          onClick={() => setShowWalletList(!showWalletList)}
          disabled={isConnecting}
        >
          <Wallet size={15} style={{ color: "#1e9b83" }} />
          <span>{isConnecting ? "Connecting…" : "Connect Arc Wallet"}</span>
          <ChevronDown size={12} style={{ opacity: 0.7 }} />
        </button>

        {showWalletList && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              width: "220px",
              background: "#fff",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              border: "1px solid #eaeaea",
              borderRadius: "8px",
              padding: "8px",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div style={{ padding: "4px 8px", fontSize: "11px", color: "#888", fontWeight: 600 }}>
              Select Wallet
            </div>
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setShowWalletList(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  background: "none",
                  border: "none",
                  padding: "8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#333",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {connector.icon && (
                  <img
                    src={connector.icon}
                    alt={connector.name}
                    style={{ width: "18px", height: "18px", borderRadius: "4px" }}
                  />
                )}
                <span>{connector.name}</span>
              </button>
            ))}
            {connectors.length === 0 && (
              <div style={{ padding: "8px", fontSize: "12px", color: "#999", textAlign: "center" }}>
                No wallets detected
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "#fff",
          border: isArc ? "1px solid #1e9b83" : "1px solid #e17055",
          borderRadius: "6px",
          padding: "3px 8px 3px 10px",
          fontSize: "12px",
          fontFamily: "var(--font-mono, monospace)",
        }}
      >
        {!isArc ? (
          <button
            onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "#ffeaa7",
              color: "#d63031",
              border: "none",
              padding: "3px 6px",
              borderRadius: "4px",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <AlertCircle size={12} /> Switch to Arc
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", color: "#1e9b83", fontWeight: 600 }}>
            <CheckCircle2 size={13} />
            <span>{typeof rawBalance !== "undefined" ? `${usdcBalance} USDC` : "Loading..."}</span>
          </div>
        )}

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(0,0,0,0.04)",
            border: "none",
            borderRadius: "4px",
            padding: "3px 7px",
            cursor: "pointer",
            fontSize: "12px",
            color: "#333",
            fontFamily: "inherit",
          }}
        >
          <span>{address.slice(0, 6)}…{address.slice(-4)}</span>
          <ChevronDown size={12} />
        </button>
      </div>

      {menuOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "240px",
            background: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            border: "1px solid #eaeaea",
            borderRadius: "8px",
            padding: "10px",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "6px", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Arc Testnet (5042002)</span>
            <button
              onClick={() => address && refreshBalance()}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}
              title="Refresh Balance"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8f9fa", padding: "6px 8px", borderRadius: "4px" }}>
            <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#333" }}>{address.slice(0, 10)}...{address.slice(-6)}</span>
            <button
              onClick={copyAddress}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#666" }}
            >
              {copied ? <Check size={13} color="#1e9b83" /> : <Copy size={13} />}
            </button>
          </div>

          <div style={{ fontSize: "12px", padding: "4px 0", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#666" }}>Arc USDC Balance:</span>
            <strong style={{ color: "#1e9b83" }}>{usdcBalance ?? "0.00"} USDC</strong>
          </div>

          <a
            href={CIRCLE_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: "#1e9b83",
              color: "#fff",
              padding: "6px 10px",
              borderRadius: "4px",
              textDecoration: "none",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            <span>Get Testnet USDC (Circle)</span>
            <ExternalLink size={12} />
          </a>

          <button
            onClick={() => disconnect()}
            style={{
              width: "100%",
              background: "none",
              border: "1px solid #ffd2d2",
              color: "#d63031",
              padding: "5px",
              borderRadius: "4px",
              fontSize: "11px",
              cursor: "pointer",
              marginTop: "4px",
            }}
          >
            Disconnect Wallet
          </button>
        </div>
      )}
    </div>
  );
}
