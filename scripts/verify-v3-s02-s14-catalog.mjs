#!/usr/bin/env node
/**
 * Compare exactly the eight S02 owner-observed hosted S14 relation catalogs
 * with LOCAL, independently loaded PostgreSQL 17.11 catalog evidence.
 * No network, environment URL, Supabase client, or production data access.
 * Passing is LIMITED eight-table catalog parity, not full hosted equivalence.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const expectedPath = new URL("../docs/v3/recovery-candidates/evidence/s02-hosted-eight-table-catalog-2026-11-09.json", import.meta.url);
const aclPath = new URL("../docs/v3/recovery-candidates/evidence/s02-hosted-eight-table-acl-2026-11-09.json", import.meta.url);
const fkPath = new URL("../docs/v3/recovery-candidates/evidence/s02-hosted-eight-table-fk-targets-2026-11-09.json", import.meta.url);
const fnPath = new URL("../docs/v3/recovery-candidates/evidence/s02-hosted-trigger-functions-2026-11-09.json", import.meta.url);

function objectType(x) {
  if (x === null) return "null";
  if (Array.isArray(x)) return "array";
  return typeof x;
}
export function differences(expected, actual, path = "$", out = []) {
  if (out.length >= 40) return out;
  const a = objectType(expected), b = objectType(actual);
  if (a !== b) {out.push({path, error:"type mismatch", expectedType:a, actualType:b}); return out;}
  if (a === "object") {
    for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
      if (!(key in expected) || !(key in actual)) out.push({path:path+"."+key,error:key in expected ? "missing local key":"unknown local key"});
      else differences(expected[key],actual[key],path+"."+key,out);
      if (out.length >= 40) break;
    }
  } else if (a === "array") {
    if (expected.length !== actual.length) out.push({path,error:"length mismatch", expected:expected.length,actual:actual.length});
    for(let i=0;i<Math.min(expected.length,actual.length);i++){
      differences(expected[i],actual[i],path+"["+i+"]",out);
      if(out.length>=40)break;
    }
  } else if (!Object.is(expected,actual)) out.push({path,error:"value mismatch",expected,actual});
  return out;
}
export function compareS02Catalog(observedLocal, hosted, acl, foreign, funcs) {
  if (!hosted || !hosted.schemaOnly || !hosted.noApplicationRows ||
      hosted.hostedDatabaseVersionNum !== "170011" ||
      hosted.counts?.columns !== 114 || hosted.counts?.constraints !== 69 ||
      hosted.counts?.indexes !== 30 || hosted.counts?.triggers !== 20 ||
      hosted.counts?.policies !== 4 ||
      !Array.isArray(hosted.tables) || hosted.tables.length !== 8 ||
      !Array.isArray(observedLocal) || observedLocal.length !== 8 ||
      foreign?.fkCount !== 16 || funcs?.functions?.length !== 19 ||
      acl?.rolesByRelation?.length !== 8)
    throw Error("FAIL CLOSED: incomplete source or local S02 catalog evidence");
  const sort = rows => [...rows].sort((a,b)=>(a.schema+"."+a.name).localeCompare(b.schema+"."+b.name));
  const mismatch=differences(sort(hosted.tables),sort(observedLocal));
  if (mismatch.length) throw Error("FAIL CLOSED: hosted/local S14 catalog drift: "+JSON.stringify(mismatch).slice(0,12000));
  return {schemaRelationCount:8,columns:114,constraints:69,indexes:30,triggers:20,policies:4,
    referencedForeignKeys:16,hostedTriggerFunctionIdentities:19};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length !== 4 || process.argv[2].startsWith("--") ||
        process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.POSTGRES_URL ||
        process.env.SUPABASE_DB_URL || process.env.SUPABASE_ACCESS_TOKEN)
      throw Error("FAIL CLOSED: provide only LOCAL catalog JSON and output proof paths with no hosted DB env");
    const hosted=JSON.parse(readFileSync(expectedPath,"utf8"));
    const acl=JSON.parse(readFileSync(aclPath,"utf8"));
    const foreign=JSON.parse(readFileSync(fkPath,"utf8"));
    const funcs=JSON.parse(readFileSync(fnPath,"utf8"));
    const actual=JSON.parse(readFileSync(resolve(process.argv[2]),"utf8"));
    const matched=compareS02Catalog(actual,hosted,acl,foreign,funcs);
    const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
    const proof={task:"S02",candidateSha:head,observedHostedHead:hosted.hostedHead,
      observedDatabaseVersion:hosted.hostedDatabaseVersion,
      environment:"disposable-networkless-postgres-17.11",...matched,
      catalogScope:"eight S14 relations, NOT complete hosted schema or RLS execution",
      fullHostedEquivalenceCertified:false,forwardUpgradeProven:false,
      productionDeploymentAuthorized:false,
      unknowns:["five referenced-parent tables are synthetic shells","19 trigger function bodies have unproven runtime dependencies","S13/S14 forward migration compatibility not executed"]};
    writeFileSync(resolve(process.argv[3]),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
    console.log("PASS: bounded hosted-observed S14 catalog matches isolated PostgreSQL 17.11 ("+head+")");
  }catch(e){console.error(e.message);process.exitCode=1;}
}
