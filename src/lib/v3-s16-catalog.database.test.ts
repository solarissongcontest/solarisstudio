import {execFileSync} from "node:child_process";
import {describe,expect,it} from "vitest";
import {requireS16LocalDatabase,S16_FUNCTION_CATALOG_SQL,S16_ROLE_AND_DEFAULT_CATALOG_SQL,s16TableCatalogSql,s16PsqlEnvironment} from "./v3-s16-catalog";
const db=process.env.V3_S16_TEST_DB_URL;
function sql(body:string){
 if(!db)throw new Error("Explicit isolated PostgreSQL is required");
 return execFileSync("psql",[requireS16LocalDatabase(db),"-X","-Atq","-v","ON_ERROR_STOP=1","-c",`begin; set local search_path=pg_catalog; ${body} rollback;`],{encoding:"utf8",env:s16PsqlEnvironment(process.env),maxBuffer:64*1024*1024}).trim().split("\n").filter(Boolean).map(line=>JSON.parse(line));
}
const setup=`create schema s16_catalog_fixture; grant usage on schema s16_catalog_fixture to anon,authenticated,service_role;
create table s16_catalog_fixture.state(id int, secret text); alter table s16_catalog_fixture.state enable row level security;
revoke all on s16_catalog_fixture.state from public,anon,authenticated,service_role;`;
describe.skipIf(!db)("S16 effective PostgreSQL catalogs and execution",()=>{
 it("detects inherited table/TRUNCATE and column UPDATE authority",()=>{
  const [table]=sql(`${setup} create role s16_catalog_parent; grant s16_catalog_parent to authenticated;
   grant insert,truncate on s16_catalog_fixture.state to s16_catalog_parent;
   grant update(secret) on s16_catalog_fixture.state to s16_catalog_parent;
   ${s16TableCatalogSql("s16_catalog_fixture.state")}`);
  expect(table.dmlRoles).toContain("authenticated");
  expect(table.columnPrivileges).toContainEqual(expect.objectContaining({role:"authenticated",column:"secret",update:true}));
 });
 it("proves API roles cannot raw-write an RPC-only table and a narrowly granted definer can",()=>{
  const [result]=sql(`${setup}
   create function public.s16_fixture_write() returns void language sql security definer set search_path=pg_catalog,pg_temp as $$insert into s16_catalog_fixture.state values(1,'governed')$$;
   revoke all on function public.s16_fixture_write() from public,anon,authenticated,service_role;
   grant execute on function public.s16_fixture_write() to authenticated;
   set local role anon; do $$begin begin insert into s16_catalog_fixture.state values(2,'bad'); raise exception 'anon wrote'; exception when insufficient_privilege then null; end;
     begin perform public.s16_fixture_write(); raise exception 'anon executed'; exception when insufficient_privilege then null; end; end$$;
   reset role; set local role service_role; do $$begin begin delete from s16_catalog_fixture.state; raise exception 'worker wrote'; exception when insufficient_privilege then null; end; end$$;
   reset role; set local role authenticated; do $$begin begin update s16_catalog_fixture.state set secret='bad'; raise exception 'authenticated wrote'; exception when insufficient_privilege then null; end; end$$;
   do $$begin perform public.s16_fixture_write();end$$;
   reset role; select jsonb_build_object('rows',(select count(*) from s16_catalog_fixture.state));`);
  expect(result.rows).toBe(1);
 });
 it("does not mistake schema-local REVOKE for global PUBLIC EXECUTE revocation",()=>{
  const [initialDefaults,revokedDefaults,functions]=sql(`alter default privileges grant execute on functions to public;
   alter default privileges in schema public revoke execute on functions from public;
   ${S16_ROLE_AND_DEFAULT_CATALOG_SQL}
   create function public.s16_fixture_overload(text) returns int language sql security definer set search_path=pg_catalog,pg_temp as $$select 1$$;
   revoke all on function public.s16_fixture_overload(text) from public;
   grant execute on function public.s16_fixture_overload(text) to authenticated;
   create function public.s16_fixture_overload(uuid) returns int language sql security definer set search_path=pg_catalog,pg_temp as $$select 1$$;
   alter default privileges revoke execute on functions from public;
   ${S16_ROLE_AND_DEFAULT_CATALOG_SQL}
   create function public.s16_fixture_new() returns int language sql security definer set search_path=pg_catalog,pg_temp as $$select 1$$;
   ${S16_FUNCTION_CATALOG_SQL}`);
  expect(initialDefaults.creatorDefaults.find((r:any)=>r.creator==='postgres').publicExecute).toBe(true);
  expect(revokedDefaults.creatorDefaults.find((r:any)=>r.creator==='postgres').publicExecute).toBe(false);
  expect(functions.find((f:any)=>f.identity==='public.s16_fixture_overload(uuid)').executeRoles).toContain('anon');
  expect(functions.find((f:any)=>f.identity==='public.s16_fixture_overload(uuid)').executeRoles).toContain('PUBLIC');
  expect(functions.find((f:any)=>f.identity==='public.s16_fixture_overload(text)').executeRoles).not.toContain('anon');
  expect(functions.find((f:any)=>f.identity==='public.s16_fixture_new()').executeRoles).not.toContain('PUBLIC');
 });
 it("detects writable views by actual API privileges, including nested views",()=>{
  const [before,after]=sql(`${setup}
   create view public.s16_fixture_view as select * from s16_catalog_fixture.state;
   create view public.s16_fixture_nested as select * from public.s16_fixture_view;
   grant insert on public.s16_fixture_nested to anon;
   set local role anon; insert into public.s16_fixture_nested values(1,'alternate writer'); reset role;
   ${s16TableCatalogSql("s16_catalog_fixture.state")}
   revoke insert on public.s16_fixture_nested from anon;
   set local role anon; do $$begin begin insert into public.s16_fixture_nested values(2,'bad');raise exception 'revoked view wrote';exception when insufficient_privilege then null;end;end$$;reset role;
   ${s16TableCatalogSql("s16_catalog_fixture.state")}`);
  expect(before.updatableViews).toContain('public.s16_fixture_nested');
  expect(after.updatableViews).toEqual([]);
 });
 it("retains actual trigger-function signatures and disabled state",()=>{
  const [table]=sql(`${setup}
   create function public.s16_fixture_trigger() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$begin return new;end$$;
   create trigger s16_guard before insert on s16_catalog_fixture.state for each row execute function public.s16_fixture_trigger();
   alter table s16_catalog_fixture.state disable trigger s16_guard;
   ${s16TableCatalogSql("s16_catalog_fixture.state")}`);
  expect(table.writeTriggers).toEqual([]);
  expect(table.triggerDetails).toContainEqual(expect.objectContaining({name:'s16_guard',enabled:'D',function:'public.s16_fixture_trigger()'}));
 });
 it("returns missing relations explicitly rather than manufacturing complete inventory",()=>{
  expect(sql(s16TableCatalogSql('public.s16_fixture_missing'))).toEqual([null]);
 });
});
