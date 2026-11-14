import { describe, expect, it } from "vitest";
import { integrationChecklist } from "./integrationChecklist";
const base = {
 account:{id:"a",status:"active",walletVerifiedAt:new Date(),receivingAddress:"0xABC"},
 keys:[{merchantAccountId:"a",revokedAt:null}],
 endpoints:[{id:"wh_a",merchantAccountId:"a",active:1}],
 intents:[{id:"pi_a",merchantAccountId:"a",status:"succeeded"}],
 transfers:[{paymentIntentId:"pi_a",toAddress:"0xabc"}],
 endpointId:"wh_a",delivered:1,
 known:{accounts:true,keys:true,payments:true,deliveries:true},
};
const states=(input:Parameters<typeof integrationChecklist>[0])=>Object.fromEntries(integrationChecklist(input).map(row=>[row.id,row.state]));
describe("seller integration evidence boundaries",()=>{
 it("observes all signals only for matching account, endpoint and transfer",()=>{
  expect(Object.values(states(base))).toEqual(Array(5).fill("complete"));
 });
 it("does not borrow another seller's key, endpoint or payment",()=>{
  const result=states({...base,keys:[{merchantAccountId:"b",revokedAt:null}],endpoints:[{id:"wh_a",merchantAccountId:"b",active:1}],intents:[{id:"pi_a",merchantAccountId:"b",status:"succeeded"}]});
  expect(result).toMatchObject({key:"action",endpoint:"action",payment:"action",event:"blocked"});
 });
 it("rejects revoked keys, paused endpoints and mismatched recipient evidence",()=>{
  expect(states({...base,keys:[{merchantAccountId:"a",revokedAt:new Date()}],endpoints:[{id:"wh_a",merchantAccountId:"a",active:0}],transfers:[{paymentIntentId:"pi_a",toAddress:"0xwrong"}]})).toMatchObject({key:"action",endpoint:"action",payment:"action",event:"blocked"});
 });
 it("does not count a succeeded status without a transfer or an unrelated transfer",()=>{
  expect(states({...base,transfers:[]})).toMatchObject({payment:"action"});
  expect(states({...base,transfers:[{paymentIntentId:"another",toAddress:"0xabc"}]})).toMatchObject({payment:"action"});
  expect(states({...base,intents:[{id:"pi_a",merchantAccountId:"a",status:"verifying"}]})).toMatchObject({payment:"action"});
 });
 it("marks stale/failed evidence unknown even if cached values look complete",()=>{
  expect(Object.values(states({...base,known:{accounts:false,keys:false,payments:false,deliveries:false}}))).toEqual(Array(5).fill("unknown"));
  expect(states({...base,known:{...base.known,deliveries:false}})).toMatchObject({event:"unknown"});
 });
 it("blocks dependent steps for pending/disabled or missing sellers",()=>{
  for(const account of [undefined,{...base.account,status:"pending"},{...base.account,status:"disabled"},{...base.account,walletVerifiedAt:null}]){
   expect(states({...base,account})).toMatchObject({wallet:"action",key:"blocked",endpoint:"blocked",payment:"blocked",event:"blocked"});
  }
 });
 it("does not infer acknowledgement from an active endpoint alone",()=>{
  expect(states({...base,delivered:0})).toMatchObject({endpoint:"complete",event:"action"});
  expect(integrationChecklist(base).find(row=>row.id==="event")?.detail).toContain("does not prove signature verification or fulfillment");
 });
});