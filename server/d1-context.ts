import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookie } from "cookie";
import { eq } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { usersD1 } from "../drizzle/schema.d1";
import { getD1 } from "./d1-db";
import { sdk } from "./_core/sdk";

export async function createD1Context({ req, res }: CreateExpressContextOptions) {
  const token = parseCookie(req.headers.cookie || "")[COOKIE_NAME];
  const session = await sdk.verifySession(token).catch(() => null);
  const user = session
    ? (await getD1().select().from(usersD1).where(eq(usersD1.openId, session.openId)).limit(1))[0] ?? null
    : null;
  return { req, res, user };
}
