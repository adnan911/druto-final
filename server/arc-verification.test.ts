import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import { arcPublicClient, ARC_USDC_ADDRESS, DRUTO_SPLITTER_ADDRESS, drutoSplitterAbi, verifyArcUsdcTransfer } from "./arc";
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { paymentProofMessage } from '@shared/payment-proof';

const seller = "0x1111111111111111111111111111111111111111";
const wallet = privateKeyToAccount(generatePrivateKey());
const payer = wallet.address;
const treasury = "0x3333333333333333333333333333333333333333";
const hash = `0x${"a".repeat(64)}` as const;

function splitLog(overrides: { address?: string; token?: `0x${string}`; intent?: string } = {}) {
  return {
    address: overrides.address ?? DRUTO_SPLITTER_ADDRESS,
    topics: encodeEventTopics({ abi: drutoSplitterAbi, eventName: "PaymentSplit", args: {
      paymentIntentId: overrides.intent ?? "pi_test", token: overrides.token ?? ARC_USDC_ADDRESS, payer,
    } }),
    data: encodeAbiParameters(parseAbi(["function data(address seller, address treasury, uint256 sellerAmount, uint256 feeAmount, uint256 totalAmount)"])[0].inputs,
      [seller, treasury, 980000n, 20000n, 1000000n]),
  };
}

function receipt(logs: unknown[], status = "success") {
  vi.spyOn(arcPublicClient, "waitForTransactionReceipt").mockResolvedValue({ status, logs } as any);
  vi.spyOn(arcPublicClient, 'getChainId').mockResolvedValue(5042002);
  vi.spyOn(arcPublicClient, 'getBlock').mockResolvedValue({ timestamp: 1000n } as any);
}

afterEach(() => vi.restoreAllMocks());

describe("Arc receipt verification", () => {
  it.each([
    { createdAt: new Date(1001000), expiresAt: new Date(1100000) },
    { createdAt: new Date(900000), expiresAt: new Date(999000) },
  ])('rejects transactions outside the order time window %j', async dates => {
    receipt([splitLog()]);
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_test', { ...dates, origin: 'https://druto.example', platformFeeBps: 200 })).rejects.toThrow('outside the checkout time window');
  });
  it('accepts timely settlement even when verification happens after expiry', async () => {
    receipt([splitLog()]);
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_test', { createdAt: new Date(900000), expiresAt: new Date(1100000), origin: 'https://druto.example', platformFeeBps: 200 })).resolves.toMatchObject({ isSplit: true });
  });
  it('rejects a receipt served by the wrong chain', async () => {
    receipt([splitLog()]);
    vi.mocked(arcPublicClient.getChainId).mockResolvedValue(1);
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_test', { createdAt: new Date(900000), expiresAt: new Date(1100000), origin: 'https://druto.example', platformFeeBps: 200 })).rejects.toThrow('Unexpected RPC chain');
  });
  it("matches an indexed intent hash from the trusted USDC splitter", async () => {
    receipt([splitLog()]);
    await expect(verifyArcUsdcTransfer(hash, "1000000", seller, "pi_test")).resolves.toMatchObject({
      isSplit: true, platformFeeAmount: "20000", merchantPayoutAmount: "980000", treasuryAddress: treasury,
    });
  });

  it.each([
    { address: payer },
    { token: payer },
    { intent: "pi_other" },
  ])("rejects an unrelated split event: %j", async overrides => {
    receipt([splitLog(overrides)]);
    await expect(verifyArcUsdcTransfer(hash, "1000000", seller, "pi_test")).rejects.toThrow("No matching");
  });

  it("records the full merchant payout and zero fees for direct transfers", async () => {
    receipt([{
      address: ARC_USDC_ADDRESS,
      topics: encodeEventTopics({ abi: parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]), eventName: "Transfer", args: { from: payer, to: seller } }),
      data: encodeAbiParameters([{ type: "uint256" }], [1000000n]),
    }]);
    const origin = 'https://druto.example';
    const payerSignature = await wallet.signMessage({ message: paymentProofMessage({ origin, paymentIntentId: 'pi_test', transactionHash: hash, merchantAddress: seller, amountAtomic: '1000000' }) });
    await expect(verifyArcUsdcTransfer(hash, "1000000", seller, "pi_test", { origin, payerSignature, createdAt: new Date(900000), expiresAt: new Date(1100000), platformFeeBps: 0, splitterAddress: null })).resolves.toMatchObject({
      isSplit: false, platformFeeAmount: "0", merchantPayoutAmount: "1000000",
    });
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_other', { origin, payerSignature, createdAt: new Date(900000), expiresAt: new Date(1100000), platformFeeBps: 0, splitterAddress: null })).rejects.toThrow('Invalid payer');
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_test', { origin: 'https://other.example', payerSignature, createdAt: new Date(900000), expiresAt: new Date(1100000), platformFeeBps: 0, splitterAddress: null })).rejects.toThrow('Invalid payer');
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_test', { origin, payerSignature, createdAt: new Date(900000), expiresAt: new Date(1100000), platformFeeBps: 200, splitterAddress: DRUTO_SPLITTER_ADDRESS })).rejects.toThrow('quoted split transaction');
  });

  it('does not settle a zero-fee direct intent from a split event', async () => {
    receipt([splitLog()]);
    await expect(verifyArcUsdcTransfer(hash, '1000000', seller, 'pi_test', { origin: 'https://druto.example', createdAt: new Date(900000), expiresAt: new Date(1100000), platformFeeBps: 0, splitterAddress: null })).rejects.toThrow('No matching USDC transfer');
  });

  it("rejects reverted transactions even if logs match", async () => {
    receipt([splitLog()], "reverted");
    await expect(verifyArcUsdcTransfer(hash, "1000000", seller, "pi_test")).rejects.toThrow("reverted");
  });
});
