import { getAddress, stringToHex } from "viem";

function getProvider() {
  if (!window.ethereum) {
    throw new Error("No compatible EVM wallet was found. Unlock Rabby or another injected wallet and try again.");
  }
  return window.ethereum;
}

function explainWalletError(error: unknown): Error {
  const candidate = error as { code?: number; message?: string };
  if (candidate?.code === 4001) return new Error("Wallet signature was cancelled. No funds were sent.");
  if (candidate?.code === -32002) return new Error("A wallet request is already pending. Open your wallet and finish or dismiss it.");
  return new Error(candidate?.message || "The wallet could not complete the signature request.");
}

export async function requestInjectedWalletAddress(): Promise<`0x${string}`> {
  try {
    const accounts = await getProvider().request({ method: "eth_requestAccounts" });
    const account = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof account !== "string") throw new Error("The wallet did not return an account. Select an account and try again.");
    return getAddress(account);
  } catch (error) {
    throw explainWalletError(error);
  }
}

export async function signInjectedWalletMessage(message: string, expectedAddress: `0x${string}`): Promise<`0x${string}`> {
  try {
    const provider = getProvider();
    const accounts = await provider.request({ method: "eth_accounts" });
    const activeAccount = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof activeAccount !== "string" || activeAccount.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error("The selected wallet account changed. Restart verification with the intended account.");
    }
    const signature = await provider.request({
      method: "personal_sign",
      params: [stringToHex(message), expectedAddress],
    });
    if (typeof signature !== "string" || !/^0x[\da-fA-F]{130}$/.test(signature)) {
      throw new Error("The wallet returned an invalid signature. Please try again.");
    }
    return signature as `0x${string}`;
  } catch (error) {
    throw explainWalletError(error);
  }
}
