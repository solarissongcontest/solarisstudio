import { expect, it } from "vitest";
import { proveIntegrityAppealAuthority, V3_INTEGRITY_APPEAL_AUTHORITY as domain } from "./v3-integrity-appeal-authority";
import type { V3S16CatalogFunctionEvidence, V3S16CatalogTableEvidence } from "./v3-s16-mutation-authority";
type MutableCatalog = {schemaVersion:1;candidateSha:string;tables:V3S16CatalogTableEvidence[];functions:V3S16CatalogFunctionEvidence[]};
const fixture=(): MutableCatalog => ({schemaVersion:1,candidateSha:"candidate",tables:[{table:"public.integrity_case_appeals",owner:"postgres",rlsEnabled:true,dmlRoles:[],columnDmlRoles:[],columnDmlGrants:[],writeTriggers:["v3_integrity_appeal_before_update","v3_integrity_appeal_changed_event"],updatableViews:[]}],functions:[...domain.canonicalCommands,...domain.sanctionedInternalWriters!,"private.v3_integrity_appeal_changed_event","private.v3_integrity_appeal_before_update"].map((name)=>({name,owner:"postgres",securityDefiner:true,searchPath:"pg_catalog, public, private",executeRoles:domain.canonicalCommands.includes(name)?["postgres",name.includes("public_submit_anonymous")?"anon":"authenticated"]:["postgres"],writesTables:name.startsWith("private.")?[]:domain.canonicalTables}))});
it("accepts only an exact-SHA complete appeal boundary, independently of unresolved case writers",()=>{
 const catalog=fixture();
 expect(proveIntegrityAppealAuthority(catalog,"candidate").passed).toBe(true);
 expect(proveIntegrityAppealAuthority(catalog,"other").passed).toBe(false);
 catalog.functions.push({name:"public.unknown_case_writer",owner:"postgres",securityDefiner:true,searchPath:"pg_catalog, public",executeRoles:["authenticated"],writesTables:["public.integrity_cases"]});
 expect(proveIntegrityAppealAuthority(catalog,"candidate").passed).toBe(true);
 catalog.functions.at(-1)!.writesTables=["public.integrity_case_appeals"];
 expect(proveIntegrityAppealAuthority(catalog,"candidate").passed).toBe(false);
});
it("rejects raw grants, unknown triggers, missing commands and callable internal implementations",()=>{
 for(const corrupt of [
  (c:MutableCatalog)=>{c.tables[0].dmlRoles=["service_role"];},
  (c:MutableCatalog)=>{c.tables[0].writeTriggers=["unknown_appeal_trigger"];},
  (c:MutableCatalog)=>{c.functions=c.functions.filter((f)=>f.name!==domain.canonicalCommands[0]);},
  (c:MutableCatalog)=>{c.functions.find((f)=>f.name===domain.sanctionedInternalWriters![0])!.executeRoles=["postgres","authenticated"];},
 ]){const catalog=fixture();corrupt(catalog);expect(proveIntegrityAppealAuthority(catalog,"candidate").passed).toBe(false);}
});
