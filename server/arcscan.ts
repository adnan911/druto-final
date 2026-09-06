import { Hash } from "viem";

export const ARCSCAN_BASE_URL = "https://testnet.arcscan.app";
export const ARCSCAN_API_URL = process.env.ARCSCAN_API_URL || `${ARCSCAN_BASE_URL}/api`;
export const ARCSCAN_API_KEY = process.env.ARCSCAN_API_KEY || "";

export interface ArcScanTxStatus {
  status: "0" | "1"; // 1 = Success, 0 = Fail / Revert
  message: string;
  result?: {
    status?: string;
    isError?: string;
    errDescription?: string;
  };
}

export interface ArcScanTokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  contractAddress: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
}

export interface ArcScanResponse<T> {
  status: string;
  message: string;
  result: T;
}

/**
 * Fetch token transfer events (ERC-20 USDC) for an address or transaction from ArcScan.
 */
export async function getArcScanTokenTransfers(params: {
  address?: string;
  contractAddress?: string;
  page?: number;
  offset?: number;
  sort?: "asc" | "desc";
}): Promise<ArcScanTokenTransfer[]> {
  try {
    const url = new URL(ARCSCAN_API_URL);
    url.searchParams.set("module", "account");
    url.searchParams.set("action", "tokentx");
    if (params.address) url.searchParams.set("address", params.address);
    if (params.contractAddress) url.searchParams.set("contractaddress", params.contractAddress);
    url.searchParams.set("page", String(params.page || 1));
    url.searchParams.set("offset", String(params.offset || 20));
    url.searchParams.set("sort", params.sort || "desc");
    if (ARCSCAN_API_KEY) {
      url.searchParams.set("apikey", ARCSCAN_API_KEY);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[ArcScan API] Request failed with status ${res.status}`);
      return [];
    }

    const data = (await res.json()) as ArcScanResponse<ArcScanTokenTransfer[] | string>;
    if (data.status === "1" && Array.isArray(data.result)) {
      return data.result;
    }
    return [];
  } catch (error) {
    console.warn("[ArcScan API] Error fetching token transfers:", error);
    return [];
  }
}

/**
 * Check transaction status on ArcScan API.
 */
export async function getArcScanTxStatus(txHash: Hash): Promise<{ isSuccess: boolean; confirmations?: number }> {
  try {
    const url = new URL(ARCSCAN_API_URL);
    url.searchParams.set("module", "transaction");
    url.searchParams.set("action", "gettxreceiptstatus");
    url.searchParams.set("txhash", txHash);
    if (ARCSCAN_API_KEY) {
      url.searchParams.set("apikey", ARCSCAN_API_KEY);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return { isSuccess: true };

    const data = (await res.json()) as ArcScanResponse<{ status: string }>;
    if (data.status === "1" && data.result?.status === "1") {
      return { isSuccess: true };
    }
    return { isSuccess: false };
  } catch (error) {
    console.warn("[ArcScan API] Error fetching tx status, falling back to RPC:", error);
    return { isSuccess: true };
  }
}

/**
 * Returns clean ArcScan explorer URLs
 */
export function getArcScanExplorerUrl(type: "tx" | "address" | "token", value: string): string {
  return `${ARCSCAN_BASE_URL}/${type}/${value}`;
}
