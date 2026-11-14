import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  keccak256,
  toBytes,
  verifyMessage,
  type Hash,
  type Log,
} from "viem";
import { paymentProofMessage } from "@shared/payment-proof";
import { parsePaymentAmount } from '../shared/usdc-amount';

export const ARC_CHAIN_ID = 5042002;
export const ARC_RPC_URL = "https://rpc.testnet.arc.io";
export const ARC_USDC_ADDRESS = getAddress("0x3600000000000000000000000000000000000000");
export const ARC_MERCHANT_WALLET_ADDRESS = getAddress(
  process.env.ARC_MERCHANT_WALLET_ADDRESS ?? "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
);

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

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
  return parsePaymentAmount(amount);
}

export function buildUsdcTransferRequest(amountAtomic: string, recipient: string = ARC_MERCHANT_WALLET_ADDRESS) {
  const resolvedRecipient = getAddress(recipient) as `0x${string}`;
  return {
    chainId: ARC_CHAIN_ID,
    tokenAddress: ARC_USDC_ADDRESS,
    recipient: resolvedRecipient,
    amountAtomic,
    abi: erc20Abi,
    functionName: "transfer" as const,
    args: [resolvedRecipient, BigInt(amountAtomic)] as const,
  };
}
export const DRUTO_SPLITTER_ADDRESS = getAddress(
  process.env.DRUTO_SPLITTER_ADDRESS ?? "0xBefE5eb904E4b1eEc684C359E1C9b3D878e522F5"
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

export type VerifiedArcTransfer = {
  fromAddress: `0x${string}`;
  toAddress: `0x${string}`;
  amountAtomic: string;
  transactionHash: Hash;
  platformFeeAmount?: string;
  merchantPayoutAmount?: string;
  treasuryAddress?: `0x${string}`;
  isSplit?: boolean;
};

export async function verifyArcUsdcTransfer(
  hash: Hash,
  expectedAmountAtomic: string,
  expectedRecipient: string = ARC_MERCHANT_WALLET_ADDRESS,
  paymentIntentId?: string,
  policy?: { createdAt: Date; expiresAt: Date; payerSignature?: `0x${string}`; origin: string; platformFeeBps: number; splitterAddress?: string | null }
): Promise<VerifiedArcTransfer> {
  const receipt = await arcPublicClient.waitForTransactionReceipt({ hash, confirmations: 1, pollingInterval: 500, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error("Arc transaction reverted");
  if (policy) {
    if (await arcPublicClient.getChainId() !== ARC_CHAIN_ID) throw new Error("Unexpected RPC chain");
    const block = await arcPublicClient.getBlock({ blockHash: receipt.blockHash });
    const minedAt = Number(block.timestamp) * 1000;
    if (!Number.isFinite(policy.createdAt.getTime()) || !Number.isFinite(policy.expiresAt.getTime()) || minedAt < Math.floor(policy.createdAt.getTime() / 1000) * 1000 || minedAt > policy.expiresAt.getTime()) throw new Error("Payment transaction is outside the checkout time window");
  }

  const resolvedRecipient = getAddress(expectedRecipient) as `0x${string}`;

  // A persisted fee/split quote is immutable. Direct transfers cannot settle a
  // previously quoted split intent, including intents created before this MVP.
  const directOnly = policy?.platformFeeBps === 0 && !policy.splitterAddress;
  if (policy && (!Number.isInteger(policy.platformFeeBps) || policy.platformFeeBps < 0 || policy.platformFeeBps > 10000 ||
    (policy.platformFeeBps === 0 && policy.splitterAddress))) {
    throw new Error("Payment settlement terms are inconsistent");
  }

  // 1. Check for DrutoPaymentSplitter event
  const splitEvent = (directOnly ? [] : receipt.logs)
    .filter(log => log.address.toLowerCase() === (policy?.splitterAddress || DRUTO_SPLITTER_ADDRESS).toLowerCase())
    .map(log => {
      try {
        return decodeEventLog({ abi: drutoSplitterAbi, data: log.data, topics: log.topics });
      } catch {
        return null;
      }
    })
    .find(decoded => {
      if (decoded?.eventName !== "PaymentSplit") return false;
      const args = decoded.args as any;
      const matchesRecipient = args.seller?.toLowerCase() === resolvedRecipient.toLowerCase();
      const matchesAmount = args.totalAmount?.toString() === expectedAmountAtomic;
      const matchesIntent = !paymentIntentId || args.paymentIntentId === keccak256(toBytes(paymentIntentId));
      const matchesToken = args.token?.toLowerCase() === ARC_USDC_ADDRESS.toLowerCase();
      const matchesTotals = args.sellerAmount + args.feeAmount === args.totalAmount;
      const feeBps = policy?.platformFeeBps ?? 200;
      const matchesFee = Number.isInteger(feeBps) && feeBps >= 0 && feeBps <= 10000 && args.feeAmount === BigInt(expectedAmountAtomic) * BigInt(feeBps) / BigInt(10000);
      return matchesRecipient && matchesAmount && matchesIntent && matchesToken && matchesTotals && matchesFee;
    });

  if (splitEvent && splitEvent.args) {
    const args = splitEvent.args as any;
    return {
      fromAddress: getAddress(args.payer),
      toAddress: getAddress(args.seller),
      amountAtomic: args.totalAmount.toString(),
      platformFeeAmount: args.feeAmount.toString(),
      merchantPayoutAmount: args.sellerAmount.toString(),
      treasuryAddress: getAddress(args.treasury),
      transactionHash: hash,
      isSplit: true,
    };
  }

  if (policy && !directOnly) throw new Error("Payment requires the quoted split transaction");

  // 2. Direct ERC-20 Transfer event for a zero-fee direct intent
  const matchingTransfer = receipt.logs
    .filter(log => log.address.toLowerCase() === ARC_USDC_ADDRESS.toLowerCase())
    .map(log => {
      try {
        return decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      } catch {
        return null;
      }
    })
    .find(decoded => decoded?.eventName === "Transfer" && decoded.args.to?.toLowerCase() === resolvedRecipient.toLowerCase() && decoded.args.value?.toString() === expectedAmountAtomic);

  if (!matchingTransfer || !matchingTransfer.args.from || !matchingTransfer.args.to || matchingTransfer.args.value === undefined) {
    throw new Error("No matching USDC transfer or payment split found on Arc");
  }
  if (!policy?.payerSignature || !paymentIntentId) throw new Error("Direct payment requires payer confirmation signature");
  const validProof = await verifyMessage({ address: getAddress(matchingTransfer.args.from), message: paymentProofMessage({ origin: policy.origin, paymentIntentId, transactionHash: hash, merchantAddress: resolvedRecipient, amountAtomic: expectedAmountAtomic }), signature: policy.payerSignature }).catch(() => false);
  if (!validProof) throw new Error("Invalid payer confirmation signature");

  return {
    fromAddress: getAddress(matchingTransfer.args.from),
    toAddress: getAddress(matchingTransfer.args.to),
    amountAtomic: matchingTransfer.args.value.toString(),
    platformFeeAmount: "0",
    merchantPayoutAmount: matchingTransfer.args.value.toString(),
    transactionHash: hash,
    isSplit: false,
  };
}
