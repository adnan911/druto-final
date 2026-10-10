import type { EIP1193Provider } from "viem";

declare global {
  interface Window {
    // Injected wallets are optional; account access still requires user approval.
    ethereum?: EIP1193Provider;
  }
}
