#!/usr/bin/env node
// Reconstruct ONLY the two existing RPC definitions for pinned, networkless
// PostgreSQL 17.11 parser/definition/ACL comparison. Never connects to a DB.
// Input is checked-in migration source + manually frozen catalog MD5 metadata.
import { readFileSync } from 'node:fs';

export const OBSERVED = Object.freeze({
  submit_fantasy_team: {
    source: 'supabase/migrations/20260920104806_completion_products.sql',
    signature: 'public.submit_fantasy_team(_game_id uuid, _country_ids uuid[], _captain_country_id uuid)',
    regprocedure: 'public.submit_fantasy_team(uuid,uuid[],uuid)',
    definition_md5: '8fd79103a842b29c1374a13d40406daf',
  },
  submit_prediction: {
    source: 'supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql',
    signature: 'public.submit_prediction(_round_id uuid, _payload jsonb)',
    regprocedure: 'public.submit_prediction(uuid,jsonb)',
    definition_md5: 'f10e1d1776f1bcaa25afd4b4a7f5e329',
  },
});
export const FROZEN = 'docs/v3/recovery-candidates/evidence/s06-hosted-catalog-digests-2026-11-10.json';
export const CANDIDATE = 'docs/v3/recovery-candidates/forward-only-softlaunch-deferred-rpc-rollout-local.sql';

export function extractDefinition(source, name) {
  const needle = 'create or replace function public.' + name + '(';
  const start = source.indexOf(needle);
  if (start < 0 || source.indexOf(needle, start + needle.length) >= 0) {
    throw Error('Expected exactly one canonical '+name+' definition in provided SQL source');
  }
  const tail = source.slice(start);
  const delimiter = /^as (\$[A-Za-z0-9_]*\$)\s*$/m.exec(tail);
  if (!delimiter || delimiter.index > 650) throw Error('Unexpected '+name+' body delimiter');
  const end = tail.indexOf(delimiter[1] + ';', delimiter.index + delimiter[0].length);
  if (end < 0 || end > 30000) throw Error('Missing bounded '+name+' body end');
  return tail.slice(0, end + delimiter[1].length + 1);
}

const q = value => "'" + value.replaceAll("'", "''") + "'";
const assert = (condition, message) => { if (!condition) throw Error(message); };

export function generatePinnedPg17Sql(read = path => readFileSync(path, 'utf8')) {
  const frozen = JSON.parse(read(FROZEN));
  assert(frozen.pg_version_num === 170011 &&
    Array.isArray(frozen.relations) && frozen.relations.length === 215 &&
    Array.isArray(frozen.routines) && frozen.routines.length === 727,
    'Refusing changed/incomplete frozen PostgreSQL 17.11 hosted catalog');
  const source = {}, candidate = {};
  const candidateSql = read(CANDIDATE);
  const ddl = [];
  for (const [name, info] of Object.entries(OBSERVED)) {
    const row = frozen.routines.filter(r => r.signature === info.signature);
    assert(row.length === 1 && row[0].definition_md5 === info.definition_md5 &&
      row[0].security_definer === true && row[0].owner_name === 'postgres',
      'Refusing changed/missing manually observed hosted '+name+' fingerprint');
    source[name] = extractDefinition(read(info.source), name);
    candidate[name] = extractDefinition(candidateSql, name);
    assert(source[name] !== candidate[name] &&
      candidate[name].includes('SOFT-LAUNCH') &&
      candidate[name].includes('private.studio2_feature_enabled_for'),
      'Expected exactly one guarded replacement for '+name);
    ddl.push(source[name]+';');
  }
  const lines = [
    '-- Produced offline; may run ONLY inside pinned --network none postgres:17.11.',
    "SET check_function_bodies = off;",
    'CREATE SCHEMA IF NOT EXISTS auth;',
    'CREATE SCHEMA IF NOT EXISTS private;',
    'CREATE ROLE anon NOLOGIN;',
    'CREATE ROLE authenticated NOLOGIN;',
    'CREATE ROLE service_role NOLOGIN;',
    ...ddl,
  ];
  for (const [name, info] of Object.entries(OBSERVED)) {
    const sig=q(info.regprocedure);
    lines.push(
      'REVOKE ALL ON FUNCTION '+info.regprocedure+' FROM PUBLIC, anon;',
      'GRANT EXECUTE ON FUNCTION '+info.regprocedure+' TO authenticated, service_role;',
      'DO $verify_original_'+name+'$ BEGIN',
      "  IF current_setting('server_version_num')::int <> 170011 THEN RAISE EXCEPTION 'PINNED_PG17_VERSION_REQUIRED'; END IF;",
      '  IF md5(pg_get_functiondef('+sig+'::regprocedure)) <> '+q(info.definition_md5)+
        " THEN RAISE EXCEPTION 'SOURCE_HOSTED_DEFINITION_DRIFT: "+name+"'; END IF;",
      '  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid='+sig+'::regprocedure)'+
        " THEN RAISE EXCEPTION 'SECURITY_DEFINER_MISSING: "+name+"'; END IF;",
      'END $verify_original_'+name+'$;',
    );
  }
  lines.push(
    "CREATE TEMP TABLE local_before_acl AS SELECT p.oid::regprocedure::text AS signature,",
    '  md5(coalesce(p.proacl::text, \'\')) AS acl_md5',
    "  FROM pg_proc p WHERE p.oid IN ('public.submit_fantasy_team(uuid,uuid[],uuid)'::regprocedure,",
    "    'public.submit_prediction(uuid,jsonb)'::regprocedure);"
  );
  for (const name of Object.keys(OBSERVED)) lines.push(candidate[name]+';');
  lines.push(
    'DO $verify_replaced$',
    'DECLARE v_name text; v_original text; v_current text;',
    'BEGIN',
    "  IF (SELECT count(*) FROM local_before_acl) <> 2 THEN RAISE EXCEPTION 'Missing original ACL witnesses'; END IF;",
    "  FOR v_name,v_original IN SELECT signature, acl_md5 FROM local_before_acl LOOP",
    "    SELECT md5(coalesce(p.proacl::text, '')) INTO v_current FROM pg_proc p WHERE p.oid=v_name::regprocedure;",
    "    IF v_original IS DISTINCT FROM v_current THEN RAISE EXCEPTION 'Writer ACL changed: %',v_name; END IF;",
    "    IF NOT has_function_privilege('authenticated',v_name,'EXECUTE') OR",
    "       has_function_privilege('anon',v_name,'EXECUTE') OR",
    "       has_function_privilege('PUBLIC',v_name,'EXECUTE') THEN",
    "       RAISE EXCEPTION 'Unexpected caller EXECUTE: %',v_name;",
    '    END IF;',
    '  END LOOP;',
    "  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace",
    "       WHERE n.nspname='public' AND p.proname IN ('submit_fantasy_team','submit_prediction')) <> 2",
    "    THEN RAISE EXCEPTION 'New or missing canonical submit writer'; END IF;",
    'END $verify_replaced$;',
  );
  for(const [name,info] of Object.entries(OBSERVED)){
    lines.push('DO $verify_guard_'+name+'$ BEGIN',
      '  IF md5(pg_get_functiondef('+q(info.regprocedure)+'::regprocedure)) = '+q(info.definition_md5)+
      " THEN RAISE EXCEPTION 'Guard did not replace original: "+name+"'; END IF;",
      'END $verify_guard_'+name+'$;');
  }
  lines.push("SELECT 'PASS: source-original PG17.11 hosted fingerprints, guarded replacement, same RPC signatures and EXECUTE ACL';");
  return lines.join('\n')+'\n';
}
if (process.argv[1]?.endsWith('/v3-softlaunch-deferred-rpc-pg17-contract.mjs')) {
  try {
    if(process.argv.length!==2)throw Error('No CLI arguments or remote endpoints permitted');
    process.stdout.write(generatePinnedPg17Sql());
  } catch(error) {
    console.error('PINNED_PG17_SOURCE_CONTRACT_FAILED: '+error.message);
    process.exitCode=1;
  }
}
