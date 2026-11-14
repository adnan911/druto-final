import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { d1Router } from "./d1-router";
import { withD1 } from "./d1-db";
import { encryptWebhookSecret } from "./webhooks";
import { postWorkerWebhook } from "./webhook-transport";
import { safeWebhookPayload } from "./webhook-console";
vi.mock("./webhook-transport", () => ({ postWorkerWebhook: vi.fn() }));
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
function seed(id:string,owner:number,status="pending",created=1000) {
 sqlite.prepare("INSERT OR IGNORE INTO merchantAccounts(id,marketplaceId,externalSellerId,ownerUserId,displayName,receivingAddress,status,walletVerifiedAt) VALUES (?,'market',?,?,'Store','0x1111111111111111111111111111111111111111','active',1)").run("ma"+owner,"seller"+owner,owner);
 sqlite.prepare("INSERT OR IGNORE INTO webhookEndpoints(id,marketplaceId,merchantAccountId,ownerUserId,url,urlHash,secretCiphertext,active) VALUES (?,'market',?,?,'https://receiver.invalid/webhook',?,?,1)").run("wh"+owner,"ma"+owner,owner,"hash"+owner,encryptWebhookSecret("test-only-secret"));
 const payload=JSON.stringify({id:"evt"+id,type:"payment.verified",signature:"do-not-return",data:{paymentIntentId:"pi"+id,externalOrderId:"order"+id,amountAtomic:"2000000",asset:"USDC",buyerLabel:"private@example.invalid",buyerAddress:"private-wallet",orderContext:{buyerEmail:"private@example.invalid"},secret:"never"}});
 sqlite.prepare("INSERT INTO paymentIntents(id,externalOrderId,merchantAccountId,itemName,amountAtomic,merchantAddress,expiresAt) VALUES (?,?,?,'Item','2000000','0x1111111111111111111111111111111111111111',999999)").run("pi"+id,"order"+id,"ma"+owner);
 sqlite.prepare("INSERT INTO webhookDeliveries(id,endpointId,eventId,eventType,paymentIntentId,payload,signature,status,createdAt,updatedAt) VALUES (?,?,?,'payment.verified',?,?,'must-not-leak',?,?,?)").run(id,"wh"+owner,"evt"+id,"pi"+id,payload,status,created,created);
}
beforeEach(()=>{
 sqlite=new SQLite(":memory:");sqlite.exec(readFileSync("drizzle-d1/0000_cool_tempest.sql","utf8"));
 vi.stubEnv("DRUTO_WEBHOOK_ENCRYPTION_KEY","11".repeat(32));
 vi.mocked(postWorkerWebhook).mockReset().mockResolvedValue({ok:true,status:204});
 vi.spyOn(console,"info").mockImplementation(()=>undefined);
});
afterEach(()=>{sqlite.close();vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("D1 webhook console authorization and delivery lifecycle",()=>{
 it("scopes pages/counts to the owner and redacts every sensitive field",()=>run(async()=>{
  seed("mine",1);seed("other",2,"succeeded");
  const page=await caller().merchantAccounts.webhookConsole({});
  expect(page.items.map(row=>row.id)).toEqual(["mine"]);expect(page.counts).toEqual({pending:1,failed:0,delivered:0});
  const detail=await caller().merchantAccounts.webhookDelivery({deliveryId:"mine"});
  const json=JSON.stringify(detail);expect(json).not.toMatch(/private@example|private-wallet|must-not-leak|test-only-secret|orderContext|signature/);
  expect(detail.payload?.data).toMatchObject({amountAtomic:"2000000",asset:"USDC"});
  await expect(caller().merchantAccounts.webhookDelivery({deliveryId:"other"})).rejects.toMatchObject({code:"NOT_FOUND"});
  expect((await caller().merchantAccounts.webhookConsole({endpointId:"wh2"})).items).toEqual([]);
 }));
 it("requires a session for list/detail and forbids retrying another seller",()=>run(async()=>{
  seed("other",2);
  const anonymous=d1Router.createCaller({user:null,req:{headers:{}},res:{}} as never);
  await expect(anonymous.merchantAccounts.webhookConsole({})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(anonymous.merchantAccounts.webhookDelivery({deliveryId:"other"})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(caller().merchantAccounts.retryWebhook({deliveryId:"other"})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect(postWorkerWebhook).not.toHaveBeenCalled();
 }));
 it("paginates stably at tied timestamps and keeps totals independent of filters",()=>run(async()=>{
  seed("a",1,"failed");seed("b",1,"succeeded");seed("c",1);
  const first=await caller().merchantAccounts.webhookConsole({limit:1});expect(first.items[0].id).toBe("c");
  const next=await caller().merchantAccounts.webhookConsole({limit:1,cursor:first.nextCursor!});expect(next.items[0].id).toBe("b");
  const filtered=await caller().merchantAccounts.webhookConsole({status:"failed",search:"ordera"});
  expect(filtered.items.map(row=>row.id)).toEqual(["a"]);expect(filtered.counts).toEqual({pending:1,failed:1,delivered:1});
 }));
 it("blocks paused and leased endpoints without outbound requests",()=>run(async()=>{
  seed("paused",1);sqlite.exec("UPDATE webhookEndpoints SET active=0 WHERE id='wh1'");
  await expect(caller().merchantAccounts.retryWebhook({deliveryId:"paused"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
  sqlite.exec("UPDATE webhookEndpoints SET active=1;");sqlite.prepare("UPDATE webhookDeliveries SET nextAttemptAt=?").run(Date.now()+60000);
  const result=await caller().merchantAccounts.retryWebhook({deliveryId:"paused"});expect(result.skipped).toBe(true);
  expect(postWorkerWebhook).not.toHaveBeenCalled();
 }));
 it("retries the stored event once with the same ID and never redelivers acknowledged events",()=>run(async()=>{
  seed("retry",1,"failed");
  const first=await caller().merchantAccounts.retryWebhook({deliveryId:"retry"});expect(first.ok).toBe(true);
  const second=await caller().merchantAccounts.retryWebhook({deliveryId:"retry"});expect(second.skipped).toBe(true);
  expect(postWorkerWebhook).toHaveBeenCalledTimes(1);
  expect(vi.mocked(postWorkerWebhook).mock.calls[0][2]).toBe("evtretry");
  expect((await caller().merchantAccounts.webhookDelivery({deliveryId:"retry"}))).toMatchObject({status:"succeeded",attempts:1,retryAvailable:false});
  expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"actorUserId":1'));
 }));
 it("never reports a rejected receiver as delivered",()=>run(async()=>{
  seed("failed",1);
  vi.mocked(postWorkerWebhook).mockResolvedValue({ok:false,status:503,error:"Receiver unavailable"});
  const result=await caller().merchantAccounts.retryWebhook({deliveryId:"failed"});expect(result.ok).toBe(false);
  const row=await caller().merchantAccounts.webhookDelivery({deliveryId:"failed"});expect(row.status).toBe("failed");expect(row.nextAttemptAt).not.toBeNull();
 }));
 it("lets an admin inspect scoped records but bounds inputs",()=>run(async()=>{
  seed("other",2);expect((await caller(9,"admin").merchantAccounts.webhookConsole({})).items).toHaveLength(1);
  await expect(caller().merchantAccounts.webhookConsole({limit:51})).rejects.toMatchObject({code:"BAD_REQUEST"});
 }));
 it("fails closed for malformed and oversized stored payloads",()=>{
  expect(safeWebhookPayload("{")).toBeNull();expect(safeWebhookPayload("x".repeat(262145))).toBeNull();
 });
});