import { createPublicClient, defineChain, getAddress, http, formatUnits } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.io"],
    },
    public: {
      http: ["https://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

export const ARC_CHAIN_ID = 5042002;
export const ARC_CHAIN_ID_HEX = `0x${ARC_CHAIN_ID.toString(16)}` as `0x${string}`;
export const ARC_RPC_URL = "https://rpc.testnet.arc.io";
export const ARC_USDC_ADDRESS = getAddress("0x3600000000000000000000000000000000000000");
export const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

export const arcBrowserClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL),
});

import { createConfig, injected } from 'wagmi';

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(ARC_RPC_URL),
  },
  connectors: [
    injected(),
  ],
});

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "remaining", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

export async function fetchArcUsdcBalance(address: `0x${string}`): Promise<string> {
  try {
    // 1. Try reading via in-wallet ethereum provider first (most reliable with user network)
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });
        const res = await window.ethereum.request({
          method: "eth_call",
          params: [{ to: ARC_USDC_ADDRESS, data }, "latest"],
        });
        if (res && res !== "0x" && res !== "0x0") {
          const balBigInt = BigInt(res);
          return formatUnits(balBigInt, 6);
        }
      } catch (e) {
        console.warn("In-wallet eth_call balanceOf failed, trying RPC:", e);
      }
    }

    // 2. Fallback to public client readContract
    try {
      const rawBalance = await arcBrowserClient.readContract({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      if (rawBalance > BigInt(0)) {
        return formatUnits(rawBalance, 6);
      }
    } catch (e) {
      console.warn("RPC readContract balanceOf failed:", e);
    }

    // 3. Check native balance (on Arc Testnet, native currency is USDC with 18 decimals)
    if (typeof window !== "undefined" && window.ethereum) {
      try {
        const nativeHex = await window.ethereum.request({
          method: "eth_getBalance",
          params: [address, "latest"],
        });
        if (nativeHex && nativeHex !== "0x0" && nativeHex !== "0x") {
          const nativeBigInt = BigInt(nativeHex);
          // Format as 18 decimals native USDC
          const formatted = formatUnits(nativeBigInt, 18);
          const num = parseFloat(formatted);
          if (num > 0) {
            return num.toFixed(2);
          }
        }
      } catch (e) {
        console.warn("eth_getBalance fallback failed:", e);
      }
    }

    return "0.00";
  } catch (err) {
    console.error("Error reading Arc USDC balance:", err);
    return "0.00";
  }
}

import { encodeFunctionData } from "viem";

export const DRUTO_SPLITTER_ADDRESS = getAddress(
  (import.meta as any).env?.VITE_DRUTO_SPLITTER_ADDRESS ?? "0xBefE5eb904E4b1eEc684C359E1C9b3D878e522F5"
);

export const drutoSplitterAbi = [
  {
    type: "function",
    name: "payAndSplit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "seller", type: "address" },
      { name: "totalAmount", type: "uint256" },
      { name: "feeBps", type: "uint256" },
      { name: "paymentIntentId", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "PaymentSplit",
    inputs: [
      { indexed: true, name: "paymentIntentId", type: "string" },
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "payer", type: "address" },
      { indexed: false, name: "seller", type: "address" },
      { indexed: false, name: "treasury", type: "address" },
      { indexed: false, name: "sellerAmount", type: "uint256" },
      { indexed: false, name: "feeAmount", type: "uint256" },
      { indexed: false, name: "totalAmount", type: "uint256" },
    ],
  },
] as const;

export function encodeArcUsdcApprove(spender: `0x${string}`, amountAtomic: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [getAddress(spender), BigInt(amountAtomic)],
  });
}

export function encodeArcUsdcTransfer(recipient: `0x${string}`, amountAtomic: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [getAddress(recipient), BigInt(amountAtomic)],
  });
}

export function encodePayAndSplit(
  token: `0x${string}`,
  seller: `0x${string}`,
  totalAmountAtomic: string,
  feeBps: number,
  paymentIntentId: string
): `0x${string}` {
  return encodeFunctionData({
    abi: drutoSplitterAbi,
    functionName: "payAndSplit",
    args: [
      getAddress(token),
      getAddress(seller),
      BigInt(totalAmountAtomic),
      BigInt(feeBps),
      paymentIntentId,
    ],
  });
}

