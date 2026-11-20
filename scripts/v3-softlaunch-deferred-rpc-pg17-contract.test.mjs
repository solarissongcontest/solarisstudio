import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  generatePinnedPg17Sql, extractDefinition, OBSERVED, FROZEN, CANDIDATE
} from './v3-softlaunch-deferred-rpc-pg17-contract.mjs';

const read = path => readFileSync(path,'utf8');

test('generates source-defined original and guarded RPCs, with pinned PG17.11 catalog proof',()=>{
  const sql=generatePinnedPg17Sql();
  assert.match(sql,/PINNED_PG17_VERSION_REQUIRED/);
  assert.match(sql,/SOURCE_HOSTED_DEFINITION_DRIFT: submit_fantasy_team/);
  assert.match(sql,/SOURCE_HOSTED_DEFINITION_DRIFT: submit_prediction/);
  assert.match(sql,/Writer ACL changed/);
  assert.match(sql,/Unexpected caller EXECUTE/);
  assert.match(sql,/New or missing canonical submit writer/);
  assert.match(sql,/SOFT-LAUNCH FANTASY ROLLOUT GUARD/);
  assert.match(sql,/SOFT-LAUNCH PREDICTION ROLLOUT GUARD/);
  assert.doesNotMatch(sql,/https?:\/\/|supabase\.co|service_role_key|SUPABASE_ACCESS_TOKEN/i);
  for(const [name,info] of Object.entries(OBSERVED)){
    assert.equal((sql.match(new RegExp('create or replace function public\\.'+name+'\\(','gi'))||[]).length,2);
    assert.ok(sql.includes(info.definition_md5));
  }
});

test('extracts only one bounded canonical function at a time',()=>{
  const original=read(OBSERVED.submit_prediction.source);
  const fn=extractDefinition(original,'submit_prediction');
  assert.match(fn,/^create or replace function public\.submit_prediction/);
  assert.ok(fn.endsWith('$submit$;'));
  assert.throws(()=>extractDefinition(original,'submit_missing'),/exactly one/);
  assert.throws(()=>extractDefinition(fn+'\n'+fn,'submit_prediction'),/exactly one/);
});

test('refuses tampered hosted fingerprint, version or unguarded candidate',()=>{
  const frozen=JSON.parse(read(FROZEN));
  assert.throws(()=>generatePinnedPg17Sql(path=>{
    if(path!==FROZEN)return read(path);
    const copy=structuredClone(frozen);
    copy.pg_version_num=170006;
    return JSON.stringify(copy);
  }),/Refusing changed/);
  assert.throws(()=>generatePinnedPg17Sql(path=>{
    if(path!==FROZEN)return read(path);
    const copy=structuredClone(frozen);
    copy.routines.find(x=>x.signature===OBSERVED.submit_fantasy_team.signature).definition_md5='0'.repeat(32);
    return JSON.stringify(copy);
  }),/manually observed/);
  assert.throws(()=>generatePinnedPg17Sql(path=>{
    const content=read(path);
    if(path!==CANDIDATE)return content;
    return content.replace('private.studio2_feature_enabled_for(v_user,', 'private.noncanonical_rollout_decision(v_user,');
  }),/guarded replacement/);
});
