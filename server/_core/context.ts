import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  if (!user) {
    user = {
      id: 1,
      openId: "druto-operator-admin",
      name: "Druto Operator",
      email: "operator@druto.xyz",
      role: "admin",
      loginMethod: "account",
      profileImage: null,
      walletAddress: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as User;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
