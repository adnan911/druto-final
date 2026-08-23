export const publicProductRoutes = ["/", "/developers", "/checkout/:session", "/receipt/:session"] as const;

export function isWalletSession(user: { openId?: string | null } | null | undefined) {
  return Boolean(user?.openId?.startsWith("wallet:"));
}

export function dashboardAccessState(user: { openId?: string | null } | null | undefined) {
  if (!user) return "connect_wallet" as const;
  return isWalletSession(user) ? "workspace" as const : "connect_wallet" as const;
}

export function isPublicProductRoute(pathname: string) {
  return pathname === "/" || pathname === "/developers" || pathname.startsWith("/checkout/") || pathname.startsWith("/receipt/");
}
