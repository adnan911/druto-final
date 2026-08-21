import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseUnits,
  type Hash,
  type Log,
} from "viem";
import { arcTestnet } from "viem/chains";

export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC_URL = "https://rpc.testnet.arc.io";
export const ARC_USDC_ADDRESS = getAddress("0x3600000000000000000000000000000000000000");
export const ARC_MERCHANT_WALLET_ADDRESS = getAddress(
  process.env.ARC_MERCHANT_WALLET_ADDRESS ?? "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
);

const erc20Abi = [
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
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

export const arcPublicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL),
});

export function amountToAtomicUsdc(amount: string) {
  return parseUnits(amount, 6).toString();
}

export function buildUsdcTransferRequest(amountAtomic: string) {
  return {
    chainId: ARC_CHAIN_ID,
    tokenAddress: ARC_USDC_ADDRESS,
    recipient: ARC_MERCHANT_WALLET_ADDRESS,
    amountAtomic,
    abi: erc20Abi,
    functionName: "transfer" as const,
    args: [ARC_MERCHANT_WALLET_ADDRESS, BigInt(amountAtomic)] as const,
  };
}

export type VerifiedArcTransfer = {
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  amountAtomic: string;
  transactionHash: Hash;
};

export async function verifyArcUsdcTransfer(hash: Hash, expectedAmountAtomic: string): Promise<VerifiedArcTransfer> {
  const receipt = await arcPublicClient.waitForTransactionReceipt({ hash, confirmations: 1, pollingInterval: 500 });
  if (receipt.status !== "success") throw new Error("Arc transaction reverted");

  const matchingTransfer = receipt.logs
    .filter(log => log.address.toLowerCase() === ARC_USDC_ADDRESS.toLowerCase())
    .map(log => {
      try {
        return decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      } catch {
        return null;
      }
    })
    .find(decoded => decoded?.eventName === "Transfer" && decoded.args.to?.toLowerCase() === ARC_MERCHANT_WALLET_ADDRESS.toLowerCase() && decoded.args.value?.toString() === expectedAmountAtomic);

  if (!matchingTransfer || !matchingTransfer.args.from || !matchingTransfer.args.to || matchingTransfer.args.value === undefined) {
    throw new Error("No matching USDC transfer to the configured merchant wallet was found");
  }

  return {
    fromAddress: getAddress(matchingTransfer.args.from),
    toAddress: getAddress(matchingTransfer.args.to),
    amountAtomic: matchingTransfer.args.value.toString(),
    transactionHash: hash,
  };
}
