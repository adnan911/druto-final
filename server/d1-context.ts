import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { dashboardSessionsD1, usersD1 } from "../drizzle/schema.d1";
import { getD1 } from "./d1-db";
import { hashD1SessionToken, readD1SessionToken } from "./d1-sessions";

export async function createD1Context({ req, res }: CreateExpressContextOptions) {
  const token = readD1SessionToken(req.headers.cookie);
  // No process cache or replica session: revocation must be checked on each request.
  const user = token
    ? (await getD1().select({ user: usersD1 }).from(dashboardSessionsD1)
      .innerJoin(usersD1, eq(dashboardSessionsD1.userId, usersD1.id))
      .where(and(eq(dashboardSessionsD1.tokenHash, hashD1SessionToken(token)),
        isNull(dashboardSessionsD1.revokedAt), gt(dashboardSessionsD1.expiresAt, new Date())))
      .limit(1))[0]?.user ?? null
    : null;
  return { req, res, user };
}
