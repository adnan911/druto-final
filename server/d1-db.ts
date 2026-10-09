import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../drizzle/schema.d1";

// A binding is carried only for the lifetime of one Worker request. Keeping a
// global D1 client would let concurrent requests use the wrong invocation.
type D1Binding = Parameters<typeof drizzle>[0];
const requestBinding = new AsyncLocalStorage<D1Binding>();

export function withD1<T>(binding: D1Binding, work: () => Promise<T>): Promise<T> {
  if (!binding || typeof binding.prepare !== "function" || typeof binding.batch !== "function") {
    throw new Error("D1 binding unavailable");
  }
  return requestBinding.run(binding, work);
}

export function getD1Binding(): D1Binding {
  const binding = requestBinding.getStore();
  if (!binding) throw new Error("D1 binding unavailable for this request");
  return binding;
}

export function getD1() {
  return drizzle(getD1Binding(), { schema });
}

export async function checkD1Readiness() {
  const binding = getD1Binding();
  const tables = ["users", "merchantAccounts", "ownershipChallenges", "walletLoginChallenges",
    "apiKeys", "paymentIntents", "paymentTransactions", "webhookEndpoints", "webhookDeliveries"];
  const result = await binding.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'merchantAccounts', 'ownershipChallenges', 'walletLoginChallenges', 'apiKeys', 'paymentIntents', 'paymentTransactions', 'webhookEndpoints', 'webhookDeliveries')").all<{ name: string }>();
  const found = new Set((result.results as Array<{ name: string }> | undefined)?.map(row => row.name));
  if (tables.some(table => !found.has(table))) throw new Error("D1 schema is incomplete");
}
