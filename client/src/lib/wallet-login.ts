export type WalletLoginMode = "injected" | "hosted" | "unavailable";

export function walletProviderAvailable(provider: unknown): boolean {
  return Boolean(provider && typeof (provider as { request?: unknown }).request === "function");
}

export function getWalletLoginMode(provider: unknown, privyReady: boolean): WalletLoginMode {
  if (walletProviderAvailable(provider)) return "injected";
  return privyReady ? "hosted" : "unavailable";
}

export function walletLoginMessage(mode: WalletLoginMode): string {
  if (mode === "hosted") return "No injected wallet was detected. Opening Druto’s hosted wallet login…";
  if (mode === "unavailable") return "Install MetaMask or Rabby, or enable the hosted wallet login";
  return "Connect your browser wallet to continue.";
}
