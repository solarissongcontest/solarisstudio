import { test } from "node:test";
import { strict as assert } from "node:assert";
import { compareSchemas } from "./compare-v3-s14-hosted-metadata.mjs";
import { readFileSync } from "node:fs";

const snapshot = JSON.parse(readFileSync(
  "docs/v3/recovery-candidates/evidence/s14-hosted-eight-table-schema-metadata-2026-11-08.json","utf8"));
const clone = obj => JSON.parse(JSON.stringify(obj));

test("read-only hosted manifest has eight tables and no application record fields", () => {
  assert.equal(Object.keys(snapshot.tables).length, 8);
  for (const v of Object.values(snapshot.tables)) {
    for (const field of ["owner","rls","force_rls","columns","constraints","indexes","triggers","policies","acl"])
      assert.ok(Object.hasOwn(v,field),field);
    for (const k of ["rows","data","records","users","email","jwt","access_token","password"])
      assert.equal(Object.hasOwn(v,k),false);
  }
  const cols = Object.values(snapshot.tables).reduce((n,t)=>n+Object.keys(t.columns).length,0);
  assert.equal(cols,114);
});

test("identical hosted and local catalog is a match", () => {
  assert.deepEqual(compareSchemas(snapshot,clone(snapshot)).diffs,[]);
  const wrapper = {schema_metadata: JSON.stringify(snapshot)};
  assert.deepEqual(compareSchemas(snapshot,JSON.stringify(wrapper)).diffs,[]);
});

test("RLS and NOT NULL changes are release blocking", () => {
  const edited = clone(snapshot);
  edited.tables["public.studio2_edition_runtime"].rls = false;
  edited.tables["public.studio2_edition_runtime"].columns.updated_at.not_null = false;
  const diff = compareSchemas(snapshot,edited).diffs;
  assert.ok(diff.some(d=>d.path==="tables.public.studio2_edition_runtime.rls" && d.category==="different"));
  assert.ok(diff.some(d=>d.path==="tables.public.studio2_edition_runtime.columns.updated_at.not_null" && d.category==="different"));
});

test("named missing constraints and local-only migration effects are distinguished", () => {
  const edited = clone(snapshot);
  delete edited.tables["public.studio2_edition_runtime"].constraints.studio2_edition_runtime_state_check;
  edited.tables["private.v3_result_versions"].columns.future_source_only={type:"boolean",not_null:false,identity:"",default_hash:null};
  const diffs=compareSchemas(snapshot,edited).diffs;
  assert.ok(diffs.some(d=>d.path.includes("studio2_edition_runtime_state_check") && d.category==="hosted-only"));
  assert.ok(diffs.some(d=>d.path.includes("future_source_only") && d.category==="local-only"));
});

test("refuses incomplete or wrong-scope manifests",()=>{
  const edited=clone(snapshot); delete edited.tables["public.studio2_organizer_tasks"];
  assert.throws(()=>compareSchemas(edited,snapshot),/exactly eight/);
  const wrong=clone(snapshot); wrong.scope="random";
  assert.throws(()=>compareSchemas(snapshot,wrong),/Invalid or incompatible/);
});
