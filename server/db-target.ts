/** This release serves only the isolated Arc Testnet TiDB database. */
export function assertDatabaseTarget(databaseUrl: string | undefined, nodeEnv = process.env.NODE_ENV): void {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for auth and payments");
  if (nodeEnv !== "production") return;

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Druto production database target is invalid");
  }

  let username: string;
  try {
    username = decodeURIComponent(url.username);
  } catch {
    throw new Error("Druto production database target is invalid");
  }

  if (
    url.protocol !== "mysql:" ||
    url.pathname !== "/druto_testnet" ||
    !url.hostname.toLowerCase().endsWith(".tidbcloud.com") ||
    url.port !== "4000" ||
    !username.endsWith(".druto_app") ||
    !url.password
  ) {
    throw new Error("Druto production database must use the restricted druto_testnet app identity");
  }
}
