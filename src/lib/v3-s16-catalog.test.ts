import {describe,expect,it} from "vitest";
import {requireS16LocalDatabase,potentialS16Write,s16PsqlEnvironment} from "./v3-s16-catalog";
import {auditV3S16CatalogAuthority,matchingS16Functions,type V3S16CatalogEvidence,type V3S16DomainDefinition} from "./v3-s16-mutation-authority";
const sha="a".repeat(40);
const domain:V3S16DomainDefinition={id:"test",risk:"integrity_critical",canonicalTables:[],canonicalOwner:"fixture",canonicalCommands:["public.write_state"]};
const fixture=():V3S16CatalogEvidence=>({schemaVersion:2,candidateSha:sha,collection:"effective-postgresql-catalog-v2",roles:{roles:[{name:"anon"},{name:"authenticated"},{name:"service_role"}]},uncertainties:[],negativeTests:{candidateSha:sha,passed:true,domains:["test"]},tables:[],functions:[{name:"public.write_state",identity:"public.write_state(uuid)",owner:"postgres",securityDefiner:true,searchPath:"pg_catalog, public, pg_temp",executeRoles:["authenticated"]}]});
describe("S16 trustworthy catalog evidence",()=>{
 it.each([undefined,"postgresql://production.supabase.co/postgres","https://127.0.0.1:54322/postgres","postgresql://127.0.0.1/db?hostaddr=1.2.3.4","postgresql://127.0.0.1/db?service=prod"])("rejects unsafe or absent database routing: %s",url=>expect(()=>requireS16LocalDatabase(url)).toThrow());
 it("normalizes localhost to literal loopback",()=>expect(requireS16LocalDatabase("postgresql://localhost:54322/postgres")).toBe("postgresql://127.0.0.1:54322/postgres"));
 it("removes inherited libpq routing and option overrides",()=>expect(s16PsqlEnvironment({PATH:"bin",PGHOSTADDR:"remote",PGSERVICE:"prod",PGOPTIONS:"-c x=y",PGPASSFILE:"secret"})).toEqual({PATH:"bin",PGCONNECT_TIMEOUT:"5"}));
 it("does not confuse public and televoting tables with the same name",()=>{
  expect(potentialS16Write("update televoting.editions set name='x'","public.editions","public")).toBe(false);
  expect(potentialS16Write('INSERT INTO "public" . "editions" values (1)',"public.editions",null)).toBe(true);
 });
 it("keeps unresolved unqualified SQL as a candidate",()=>expect(potentialS16Write("update editions set name='x'","public.editions",null)).toBe(true));
 it("does not match functions across schemas",()=>expect(matchingS16Functions(fixture(),"private.write_state")).toEqual([]));
 it("does not hide an unsafe overload behind a safe first overload",()=>{
  const c=fixture();c.functions=[...c.functions,{...c.functions[0],identity:"public.write_state(text)",executeRoles:["PUBLIC"]}];
  const findings=auditV3S16CatalogAuthority(c,sha,[domain]);
  expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({kind:"ambiguous_function_inventory"}),expect.objectContaining({kind:"canonical_function_public_execute",subject:"public.write_state(text)"})]));
  expect(matchingS16Functions(c,"public.write_state(uuid)")).toHaveLength(1);
 });
 it("requires execution evidence rather than trusting an apparently clean catalog",()=>{
  const c=fixture();delete c.negativeTests;
  expect(auditV3S16CatalogAuthority(c,sha,[domain])).toContainEqual(expect.objectContaining({kind:"database_execution_evidence_missing"}));
 });
 it("keeps stale and unresolved SQL evidence fail-closed",()=>{
  const c=fixture();c.uncertainties=["dynamic SQL"];
  expect(auditV3S16CatalogAuthority(c,sha,[domain])).toContainEqual(expect.objectContaining({kind:"catalog_analysis_incomplete"}));
  expect(auditV3S16CatalogAuthority(c,"b".repeat(40),[domain])).toContainEqual(expect.objectContaining({kind:"catalog_evidence_missing"}));
 });
 it("does not exempt merged Results authority from catalog checks",()=>{
  const c=fixture();c.functions=[];
  expect(auditV3S16CatalogAuthority(c,sha,[{...domain,resultsFrozenOwner:true}])).toContainEqual(expect.objectContaining({kind:"canonical_function_missing",ownerBoundary:"results_pr_1400"}));
 });
});
