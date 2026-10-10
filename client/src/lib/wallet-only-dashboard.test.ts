import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { Router } from "wouter";
import { wagmiConfig } from "./arcChain";

const session = vi.hoisted(() => ({
  data: null as null | { name: string; openId: string },
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => {
  const procedure = (path = ""): any => new Proxy(() => {}, {
    get: (_target, key) => {
      if (key === "useQuery") return () => path === "auth.me" ? session : { data: undefined, isLoading: false };
      if (key === "useMutation") return () => ({ isPending: false, mutateAsync: vi.fn() });
      if (key === "useUtils") return () => procedure();
      return procedure(path ? `${path}.${String(key)}` : String(key));
    },
  });
  return { trpc: procedure() };
});

import Home from "../pages/Home";

function renderDashboard() {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    return renderToStaticMarkup(createElement(WagmiProvider, { config: wagmiConfig },
      createElement(QueryClientProvider, { client: queries },
        createElement(Router, { ssrPath: "/dashboard" }, createElement(Home)))));
  } finally { queries.clear(); }
}

beforeEach(() => { session.data = null; session.isLoading = false; });

describe("wallet-only dashboard without an external auth provider", () => {
  it("renders EVM wallet sign-in for an anonymous visitor", () => {
    const html = renderDashboard();
    expect(html).toContain("Sign in with EVM Wallet");
    expect(html).not.toContain("Sign in with Privy");
    expect(html).not.toContain("Live Arc ledger");
  });

  it("waits for the server session before rendering the workspace", () => {
    session.isLoading = true;
    const html = renderDashboard();
    expect(html).toContain("Verifying your sign-in session.");
    expect(html).not.toContain("Live Arc ledger");
  });

  it("renders the verified wallet workspace and sign-out without Privy context", () => {
    session.data = { name: "Test seller", openId: "wallet-0x1234" };
    const html = renderDashboard();
    expect(html).toContain("Test seller");
    expect(html).toContain("Live Arc ledger");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Sign in with Privy");
  });
});
