import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {tables,columns,functions,indexes,triggers} from "./v3-s13-s14-catalog-export.mjs";
const path="docs/v3/recovery-candidates/evidence/s13-s16-current-hosted-frontier-2026-11-19.json";
const x=JSON.parse(readFileSync(path,"utf8"));
assert.equal(x.schema_version,1);
assert.equal(x.project_id,"dkxmnvekiopyesuzggeu");
assert.match(x.source_sha,/^[a-f0-9]{40}$/);
assert.equal(x.method.includes("single-SELECT"),true);
assert.equal(x.execution_envelope.transaction_read_only_recorded,"off","Do not fabricate read-only transaction attestations");
assert.equal(x.hosted_ledger.applied,497);
assert.equal(x.hosted_ledger.tip,"20261101181812");
assert.equal(x.hosted_ledger.legacy_bootstrap_cutoff,"20261014020000");
const c=x.s13_s14_catalog,d=x.downstream_catalog;
assert.equal(c.project_ref,x.project_id);
assert.equal(c.schema_version,1);
assert.equal(c.checkpoint.server_version_num,"170011");
assert.ok(Number.isFinite(Date.parse(x.captured_at)));
for(const [kind,expected] of Object.entries({
  tables,columns:columns.map(v=>v.relation+"/"+v.name),functions,indexes,triggers:triggers.map(v=>v.join("/"))
})){
 const actual=c[kind].map(v=>["columns","triggers"].includes(kind)?v.relation+"/"+v.name:v.identity);
 assert.deepEqual([...actual].sort(),[...expected].sort(),kind+": missing/extra/duplicate objects");
}
assert.equal(c.tables.filter(v=>v.exists_now).length,4);
assert.equal(c.functions.filter(v=>v.exists_now).length,4);
assert.equal(c.indexes.filter(v=>v.exists_now).length,0);
assert.equal(c.triggers.filter(v=>v.exists_now).length,2);
assert.equal(c.columns.length,31);
assert.ok(c.columns.every(v=>v.exists_now&&v.compatible));
assert.equal(d.project_ref,x.project_id);
assert.equal(d.tables.length,6);
assert.equal(d.tables.filter(v=>v.exists_now).length,5);
assert.equal(d.functions.length,9);
assert.equal(d.functions.filter(v=>v.exists_now).length,2);
assert.equal(x.downstream_drift,false);
for(const required of ["public.v3_register_migration_contract(text,integer,text,boolean,text,text)","private.v3_guard_source_managed_televote_projection()"]){
 const group=required.startsWith("public.")?c.functions:d.functions;
 assert.equal(group.find(v=>v.identity===required)?.exists_now,false,"Missing canonical command mismatch: "+required);
}
const h=x.unrecorded_source_files;
assert.equal(h.filter(v=>v.status==="postbootstrap historical ledger gap").length,36);
assert.equal(h.filter(v=>v.status==="newer than hosted tip").length,59);
assert.equal(new Set(h.map(v=>v.version)).size,h.length);
assert.ok(h.every(v=>/^supabase\/migrations\/\d{14}_.+\.sql$/.test(v.path)&&/^[a-f0-9]{40}$/.test(v.git_blob_sha)));
assert.equal(x.certification.isolated_recovery_equivalence,false);
assert.equal(x.certification.real_backup_complete_restore,false);
assert.equal(x.certification.hosted_sql_manifest_approved,false);
assert.equal(x.certification.cloudflare_promoted,false);
console.log(JSON.stringify({passed:true,source_sha:x.source_sha,sha256:createHash("sha256").update(readFileSync(path)).digest("hex"),
 sourceLedger:{legacyPrebootstrap:x.hosted_ledger.unpaired_prebootstrap_source_files,postbootstrapGaps:36,future:59},
 productionQueriesUsedByThisCheck:0,hostedEquivalenceCertified:false},null,2));
