import { defineConfig } from "drizzle-kit";

// Separate migration lineage for the new testnet database. No credentials loaded here.
// Apply via the guarded TiDB setup script, never against the legacy `test` database.
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle-tidb",
  dialect: "mysql",
});
