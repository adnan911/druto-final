export const ENV = {
  get appId() { return process.env.VITE_APP_ID || "druto-platform-app"; },
  get cookieSecret() { return process.env.JWT_SECRET || "druto-local-development-jwt-secret-key-32b"; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.OAUTH_SERVER_URL ?? ""; },
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production" || process.env.DRUTO_RUNTIME === "cloudflare"; },
  get forgeApiUrl() { return process.env.BUILT_IN_FORGE_API_URL ?? ""; },
  get forgeApiKey() { return process.env.BUILT_IN_FORGE_API_KEY ?? ""; },
  get privyAppId() { return process.env.PRIVY_APP_ID ?? ""; },
  get privyAppSecret() { return process.env.PRIVY_APP_SECRET ?? ""; },
  get pinataJwt() { return process.env.PINATA_JWT ?? ""; },
  get pinataGateway() { return process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud"; },
};
