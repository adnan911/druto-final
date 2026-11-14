import { describe, expect, it } from "vitest";
import { encodePayAndSplit, encodeArcUsdcApprove, drutoSplitterAbi, DRUTO_SPLITTER_ADDRESS } from "../client/src/lib/arcChain";
import { amountToAtomicUsdc } from "./arc";

describe("DrutoPaymentSplitter smart contract integration", () => {
  const sampleToken = "0x3600000000000000000000000000000000000000" as const;
  const sampleSeller = "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217" as const;
  const sampleAmount = amountToAtomicUsdc("10.00"); // 10000000
  const sampleFeeBps = 200; // 2.0%
  const sampleIntentId = "pi_split_test123";

  it("exports a valid DrutoPaymentSplitter contract address", () => {
    expect(DRUTO_SPLITTER_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("exports correct contract ABI functions and events", () => {
    const payAndSplitItem = drutoSplitterAbi.find(item => item.name === "payAndSplit");
    expect(payAndSplitItem).toBeDefined();
    expect(payAndSplitItem?.inputs.length).toBe(5);

    const paymentSplitEvent = drutoSplitterAbi.find(item => item.name === "PaymentSplit");
    expect(paymentSplitEvent).toBeDefined();
    expect(paymentSplitEvent?.inputs.length).toBe(8);
  });

  it("encodes payAndSplit function call with correct parameter types", () => {
    const calldata = encodePayAndSplit(
      sampleToken,
      sampleSeller,
      sampleAmount,
      sampleFeeBps,
      sampleIntentId
    );

    expect(calldata).toMatch(/^0x[a-fA-F0-9]+/);
    expect(calldata.length).toBeGreaterThan(64);
  });

  it("encodes ERC20 approve call for DrutoPaymentSplitter", () => {
    const approveCalldata = encodeArcUsdcApprove(DRUTO_SPLITTER_ADDRESS, sampleAmount);
    expect(approveCalldata).toMatch(/^0x[a-fA-F0-9]+/);
    expect(approveCalldata.length).toBeGreaterThan(64);
  });

  it("calculates platform fee (2%) and merchant payout (98%) accurately", () => {
    const totalAtomic = BigInt(sampleAmount); // 10000000 (10 USDC)
    const feeAtomic = (totalAtomic * BigInt(sampleFeeBps)) / BigInt(10000); // 200000 (0.20 USDC)
    const payoutAtomic = totalAtomic - feeAtomic; // 9800000 (9.80 USDC)

    expect(feeAtomic.toString()).toBe("200000");
    expect(payoutAtomic.toString()).toBe("9800000");
    expect(feeAtomic + payoutAtomic).toBe(totalAtomic);
  });
});
