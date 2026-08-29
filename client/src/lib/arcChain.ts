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
      url: "https://explorer.testnet.arc.io",
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
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
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
    const rawBalance = await arcBrowserClient.readContract({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    return formatUnits(rawBalance, 6);
  } catch (err) {
    console.error("Error reading Arc USDC balance:", err);
    return "0.00";
  }
}

import { encodeFunctionData } from "viem";

export function encodeArcUsdcTransfer(recipient: `0x${string}`, amountAtomic: string): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [getAddress(recipient), BigInt(amountAtomic)],
  });
}

