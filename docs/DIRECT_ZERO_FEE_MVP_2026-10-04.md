# Arc Testnet direct payment, zero platform fee — local implementation

Decision from the product owner: the MVP uses direct USDC transfers to each seller and charges **0% Druto platform fee**. Gas/network costs are separate; a zero Druto fee does not mean a buyer's wallet transaction is free.

## Payment terms

New `payments.createIntent` rows explicitly persist `platformFeeBps=0`, `platformFeeAmount="0"`, `merchantPayoutAmount=amountAtomic`, and `splitContractAddress=NULL`. The public checkout and server creation response expose those same terms. The buyer sends the exact USDC amount to the seller receiving wallet. Receipt verification still checks chain, time window, USDC transfer, recipient, exact amount, and payer signature. Successful settlement records zero Druto fee and full seller proceeds.

No on-chain treasury collection, escrow, pooled custody, refunds, wallet gas sponsorship, or fiat payout is implemented by this choice. The historical database column default remains 200 bps. The application explicitly writes zero for every new intent; changing the schema default requires a reviewed forward migration, not an ad hoc `db:push` or manual production edit.

## Historical intent behavior

Existing Payment Intents are immutable. Their 2% quote is not rewritten to 0%. The new hosted checkout blocks wallet submission for an unresolved intent with a nonzero fee or split address and asks the marketplace to create a new order/payment link. A retry with the same idempotency key and changed fee terms returns CONFLICT with an instruction to use a new order and key. Marketplace integrations should create a new order/payment attempt and bind that new Intent before redirecting the buyer. Do not silently replace a previously bound intent on an existing order.

The verifier accepts direct settlement only for an intent with zero fee and no split address. A historical split quote requires a matching split event and fee; it cannot settle from a direct transfer. Any buyer who already sent USDC directly for an older 2% intent needs manual transaction/order reconciliation by an operator. Do not prompt them to send a second payment or mark the order paid solely because a transaction hash was submitted. The separate exception/recovery workflow is still a release blocker.

`DrutoPaymentSplitter.sol` and its developer page example remain experimental material for a later product phase. No new intent references that contract. The developer page now labels the example as outside the MVP.

## Verification on 2026-10-04

- 149 root tests passed, 1 live Privy test skipped.
- 11 Arc receipt verification tests passed, including direct zero fee, rejection of direct settlement for a quoted split, and rejection of split settlement for a zero-fee direct intent.
- Real TiDB router test passed with a restricted app identity inside a rollback transaction; new persisted intent and response both carried zero fee/full seller payout/no split address. Fixture cleanup was checked.
- TypeScript `--noEmit` and full frontend/server/Vercel API bundle build passed.

No buyer wallet payment, live webhook, contract execution, current Vercel configuration or deployed rollout was tested. Before any deployment, confirm the target TiDB connection, seller wallet proof/account binding, old checkout link handling, webhook receiver, and marketplace order flow. Separate network gas from Druto fee in buyer-facing copy.
