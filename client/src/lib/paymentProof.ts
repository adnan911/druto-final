import { stringToHex } from 'viem';
import { paymentProofMessage } from '@shared/payment-proof';

export async function signPaymentConfirmation(intent: { id: string; verificationOrigin: string; merchantAddress: string; amountAtomic: string }, transactionHash: string) {
  if (!window.ethereum) throw new Error('Connect the wallet that sent this payment to confirm it');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts?.[0]) throw new Error('No payer wallet selected');
  const message = paymentProofMessage({ origin: intent.verificationOrigin, paymentIntentId: intent.id, transactionHash, merchantAddress: intent.merchantAddress, amountAtomic: intent.amountAtomic });
  return await window.ethereum.request({ method: 'personal_sign', params: [stringToHex(message), accounts[0]] }) as string;
}
