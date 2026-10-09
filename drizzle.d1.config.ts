import { defineConfig } from "drizzle-kit";

// Generate SQL offline. No remote D1 database is configured here.
export default defineConfig({
  schema: "./drizzle/schema.d1.ts",
  out: "./drizzle-d1",
  dialect: "sqlite",
});
