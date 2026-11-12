import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { compareS02Catalog } from "./verify-v3-s02-s14-catalog.mjs";
const read=(name)=>JSON.parse(readFileSync(new URL("../docs/v3/recovery-candidates/evidence/"+name,import.meta.url),"utf8"));
const hosted=read("s02-hosted-eight-table-catalog-2026-11-09.json");
const fk=read("s02-hosted-eight-table-fk-targets-2026-11-09.json");
const acl=read("s02-hosted-eight-table-acl-2026-11-09.json");
const fn=read("s02-hosted-trigger-functions-2026-11-09.json");
const copy=x=>JSON.parse(JSON.stringify(x));
describe("S02 hosted-observed catalog exact-scope parity and negative cases",()=>{
 it("accepts complete eight-relation observed catalog with known limitations",()=>{
  expect(compareS02Catalog(copy(hosted.tables),hosted,acl,fk,fn)).toMatchObject({columns:114,constraints:69,indexes:30,triggers:20,policies:4});
 });
 it("fails closed for unknown/missing local relation",()=>{
  const x=copy(hosted.tables);x.pop();
  expect(()=>compareS02Catalog(x,hosted,acl,fk,fn)).toThrow(/FAIL CLOSED/);
 });
 it("fails closed for missing hosted evidence, missing FK or trigger dependencies",()=>{
  expect(()=>compareS02Catalog(hosted.tables,{...hosted,counts:{...hosted.counts,triggers:19}},acl,fk,fn)).toThrow(/FAIL CLOSED/);
  expect(()=>compareS02Catalog(hosted.tables,hosted,acl,{...fk,fkCount:15},fn)).toThrow(/FAIL CLOSED/);
  expect(()=>compareS02Catalog(hosted.tables,hosted,acl,fk,{functions:[]})).toThrow(/FAIL CLOSED/);
 });
 it("rejects changed owner, RLS, default, guard, index and policy",()=>{
  for(const mutate of [
   x=>x[0].owner="unknown",
   x=>x[0].rls=!x[0].rls,
   x=>x[0].columns[0].notnull=!x[0].columns[0].notnull,
   x=>x[0].constraints[0].validated=false,
   x=>x[0].indexes[0].valid=false,
   x=>x.find(t=>t.name==="admin_notifications").triggers[0].enabled="D",
   x=>x.find(t=>t.name==="admin_notifications").policies[0].using="true",
  ]){
   const x=copy(hosted.tables);mutate(x);
   expect(()=>compareS02Catalog(x,hosted,acl,fk,fn)).toThrow(/FAIL CLOSED/);
  }
 });
});
