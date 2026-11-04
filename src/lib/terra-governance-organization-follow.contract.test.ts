import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
const sql=read("supabase/migrations/20261104133000_v3_tg10_organization_follow_preferences.sql");
const rehearsal=read("scripts/rehearse-v3-world-organization-follows.sql");
const runner=read("scripts/rehearse-v3-world-organization-follows.sh");
describe("TG10 organization follow preference contracts",()=>{
 it("extends one canonical follow RPC and existing S5 event identity",()=>{
  expect(sql).toContain("p_entity_type not in ('country', 'edition', 'show', 'organization')");
  expect(sql).toContain("_entity_type not in ('country', 'edition', 'show', 'organization')");
  expect(sql).toContain("organization_row.public_visibility = 'public'");
  expect(sql).toContain("organization_row.status in ('recognized', 'active')");
  expect(sql).not.toMatch(/create table (?:public\.)?world_follows/i);
 });
 it("restricts category visibility and mutations to the follow owner",()=>{
  expect(sql).toContain("alter table public.fan_follow_categories enable row level security");
  expect(sql).toContain("follow_row.profile_id=(select auth.uid())");
  expect(sql).toContain("follow_row.profile_id=v_actor");
  expect(sql).toContain("for update;");
  expect(sql).not.toContain("grant insert, update, delete on public.fan_follow_categories to authenticated");
 });
 it("rehearses public/private, cross-user and reversal with rollback-only local DB",()=>{
  for(const c of ["TG10_PRIVATE_ORGANIZATION_FOLLOW_ALLOWED","TG10_FOLLOW_EVENT_IDENTITY_MISSING",
    "TG10_FOREIGN_CATEGORY_UPDATE_ALLOWED","TG10_FOREIGN_CATEGORY_READ_ALLOWED",
    "TG10_ORGANIZATION_REMOVAL_FAILED","TG10_CATEGORY_CASCADE_FAILED","rollback;"])
   expect(rehearsal).toContain(c);
  expect(runner).toContain("Refusing non-loopback database");
  expect(runner).toContain('psql "$DB_URL"');
 });
});
