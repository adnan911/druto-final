import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { d1Router } from "./d1-router";
import { withD1 } from "./d1-db";




const { DatabaseSync: SQLite } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let sqlite: DatabaseSync;
function statement(sql: string, params: SQLInputValue[] = []): any {
 return { bind: (...values: SQLInputValue[]) => statement(sql, values),
  raw: async () => sqlite.prepare(sql).all(...params).map(row => Object.values(row)),
  all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  first: async () => sqlite.prepare(sql).get(...params) ?? null,
  run: async () => ({success:true,meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}) };
}
const binding = { prepare:statement, batch:async (items:any[]) => { const rows=[];for(const item of items)rows.push(await item.run());return rows; } };
const run = <T>(fn:()=>Promise<T>) => withD1(binding as never,fn);
const caller = (id=1,role="user") => d1Router.createCaller({user:{id,openId:"test",role},req:{headers:{}},res:{}} as never);
beforeEach(()=>{
 sqlite=new SQLite(":memory:");sqlite.exec(readFileSync("drizzle-d1/0000_cool_tempest.sql","utf8"));
 for(const [id,owner,status,verified] of [["mine",1,"active",1],["other",2,"active",1],["pending",1,"pending",null],["disabled",1,"disabled",1]] as const){
  sqlite.prepare("INSERT INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt) VALUES (?,'market',?,?,'Store','0x1111111111111111111111111111111111111111',?,?)").run(id,id,owner,status,verified);
 }
});
afterEach(()=>{sqlite.close();vi.restoreAllMocks();});
describe("D1 seller credential lifecycle",()=>{
 it("returns a seller-bound secret once and persists only its hash",()=>run(async()=>{
  const created=await caller().apiKeys.create({name:" Test backend ",merchantAccountId:"mine"});
  expect(created).toMatchObject({name:"Test backend",merchantAccountId:"mine",sellerId:"mine"});
  expect(created.secret.length).toBeGreaterThan(32);
  const stored=sqlite.prepare("SELECT * FROM apiKeys WHERE id=?").get(created.id);
  expect(stored?.secretHash).not.toBe(created.secret);
  const list=await caller().apiKeys.list();
  expect(list).toHaveLength(1);expect(list[0]).not.toHaveProperty("secret");expect(list[0]).not.toHaveProperty("secretHash");
  expect(JSON.stringify(list)).not.toContain(created.secret);
 }));
 it("rejects cross-owner, pending and disabled seller issuance",()=>run(async()=>{
  for(const merchantAccountId of ["other","pending","disabled"])
   await expect(caller().apiKeys.create({name:"Key",merchantAccountId})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(sqlite.prepare("SELECT count(*) AS n FROM apiKeys").get()?.n).toBe(0);
 }));
 it("isolates listings and refuses another owner's revocation",()=>run(async()=>{
  const other=await caller(2).apiKeys.create({name:"Other key",merchantAccountId:"other"});
  expect(await caller().apiKeys.list()).toEqual([]);
  await expect(caller().apiKeys.revoke({id:other.id})).rejects.toMatchObject({code:"NOT_FOUND"});
  expect(sqlite.prepare("SELECT revokedAt FROM apiKeys WHERE id=?").get(other.id)?.revokedAt).toBeNull();
 }));
 it("revokes the owned key without changing seller wallet or existing payments",()=>run(async()=>{
  const created=await caller().apiKeys.create({name:"Own key",merchantAccountId:"mine"});
  sqlite.exec("INSERT INTO paymentIntents(id,externalOrderId,merchantAccountId,itemName,amountAtomic,merchantAddress,expiresAt) VALUES ('existing','old-order','mine','Preserved order','2000000','0x1111111111111111111111111111111111111111',999999)");
  await caller().apiKeys.revoke({id:created.id});
  expect((await caller().apiKeys.list())[0].revokedAt).toBeInstanceOf(Date);
  expect(sqlite.prepare("SELECT count(*) AS n FROM paymentIntents").get()?.n).toBe(1);
  await expect(caller().payments.createIntent({seller:{marketplaceId:"market",sellerId:"mine"},externalOrderId:"order",itemName:"Item",amount:"2"})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  const keyCaller=d1Router.createCaller({user:null,req:{headers:{authorization:"Bearer "+created.secret}},res:{}} as never);
  await expect(keyCaller.payments.createIntent({seller:{marketplaceId:"market",sellerId:"mine"},externalOrderId:"order",itemName:"Item",amount:"2"})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(sqlite.prepare("SELECT receivingAddress FROM merchantAccounts WHERE id='mine'").get()?.receivingAddress).toBe("0x1111111111111111111111111111111111111111");
 }));
 it("requires authentication for list, create and revoke",()=>run(async()=>{
  const anonymous=d1Router.createCaller({user:null,req:{headers:{}},res:{}} as never);
  await expect(anonymous.apiKeys.list()).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(anonymous.apiKeys.create({name:"Key",merchantAccountId:"mine"})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(anonymous.apiKeys.revoke({id:"anything"})).rejects.toMatchObject({code:"UNAUTHORIZED"});
 }));
});