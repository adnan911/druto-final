import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL || "mysql://root:password@localhost:3306/druto";

function parseCredentials(connStr: string) {
  try {
    const parsed = new URL(connStr);
    const isSsl = parsed.searchParams.has("ssl") || parsed.hostname.includes("tidb");
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 4000,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, "") || "test",
      ...(isSsl ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
    };
  } catch {
    return { url: connStr };
  }
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: parseCredentials(rawUrl),
});
