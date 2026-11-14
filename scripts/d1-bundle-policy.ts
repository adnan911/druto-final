import type { Plugin } from "vite";

// These browser integrations are retired from the wallet-only D1 product.
// Check emitted chunks, including lazy chunks, rather than only source imports.
export function forbiddenD1Module(id: string): boolean {
  const normalized = id.replaceAll("\\", "/");
  return /\/node_modules\/(?:@privy-io\/|x402\/|decode-uri-component\/)/.test(normalized)
    || /\/node_modules\/\.pnpm\/(?:@privy-io\+|x402@|decode-uri-component@)/.test(normalized);
}

export function d1BundlePolicy(): Plugin {
  return {
    name: "druto-d1-bundle-policy",
    apply: "build",
    generateBundle(_options, bundle) {
      const modules = new Set(Object.values(bundle).flatMap(output =>
        output.type === "chunk" ? Object.keys(output.modules) : []));
      const forbidden = Array.from(modules).filter(forbiddenD1Module);
      if (forbidden.length) {
        this.error(`Retired authentication dependency in D1 browser bundle: ${forbidden.join(", ")}`);
      }
      this.info(`Checked ${modules.size} emitted modules: no retired Privy/x402/URI-decoder dependencies`);
    },
  };
}
