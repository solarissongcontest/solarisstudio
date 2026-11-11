#!/usr/bin/env node
// S06: strict, offline 50-relation verification against immutable hosted metadata.
// The positive verifier checks ACTUAL local pg_catalog JSON in CI, not DDL source claims.
// No application rows, network, hosted test connections or release authority.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const S06_FIFTY = Object.freeze({
  "auth.custom_oauth_providers": [
    25,
    20,
    6,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.flow_state": [
    17,
    1,
    4,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.identities": [
    9,
    3,
    4,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.mfa_amr_claims": [
    5,
    3,
    2,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.mfa_challenges": [
    7,
    2,
    2,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.mfa_factors": [
    13,
    3,
    6,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.mfa_recovery_code_sets": [
    7,
    6,
    3,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.mfa_recovery_codes": [
    5,
    2,
    2,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.oauth_authorizations": [
    17,
    13,
    4,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.oauth_clients": [
    13,
    5,
    2,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.oauth_consents": [
    6,
    7,
    5,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.one_time_tokens": [
    8,
    3,
    4,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.refresh_tokens": [
    9,
    3,
    7,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.saml_providers": [
    9,
    6,
    3,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.saml_relay_states": [
    8,
    4,
    4,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.scim_tokens": [
    8,
    5,
    5,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.scim_users": [
    10,
    3,
    10,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.sessions": [
    15,
    4,
    5,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.sso_domains": [
    5,
    3,
    3,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.sso_providers": [
    5,
    2,
    3,
    0,
    0,
    "supabase_auth_admin",
    true,
    false
  ],
  "auth.webauthn_challenges": [
    6,
    3,
    3,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "auth.webauthn_credentials": [
    14,
    2,
    3,
    0,
    0,
    "supabase_auth_admin",
    false,
    false
  ],
  "private.v3_confirmation_operations": [
    7,
    5,
    4,
    0,
    1,
    "postgres",
    false,
    false
  ],
  "public.admin_audit_log": [
    10,
    4,
    7,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_access": [
    3,
    2,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_events": [
    7,
    3,
    2,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_evidence": [
    22,
    12,
    5,
    0,
    2,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_findings": [
    9,
    4,
    2,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_internal_notes": [
    5,
    3,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_messages": [
    7,
    4,
    2,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_relations": [
    7,
    7,
    2,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_requests": [
    9,
    5,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_reviewers": [
    7,
    5,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_rule_links": [
    7,
    5,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_case_sanctions": [
    17,
    11,
    3,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_cases": [
    19,
    11,
    5,
    0,
    3,
    "postgres",
    true,
    false
  ],
  "public.integrity_evidence_access_log": [
    8,
    6,
    3,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_evidence_upload_tokens": [
    12,
    7,
    2,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_preclearance_rulings": [
    8,
    5,
    3,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.integrity_public_decisions": [
    9,
    3,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.permission_evaluation_events": [
    9,
    6,
    6,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "public.round_stats": [
    3,
    2,
    1,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.ssc_rule_interpretation_sources": [
    5,
    5,
    2,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.studio2_access_roles": [
    5,
    3,
    1,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "public.studio2_permission_change_approval_requests": [
    17,
    13,
    4,
    0,
    1,
    "postgres",
    true,
    false
  ],
  "public.studio2_result_operation_executions": [
    10,
    11,
    5,
    0,
    1,
    "postgres",
    true,
    false
  ],
  "public.studio2_role_capabilities": [
    3,
    3,
    2,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "public.submission_versions": [
    9,
    6,
    3,
    2,
    0,
    "postgres",
    true,
    false
  ],
  "televoting.anti_abuse_events": [
    13,
    2,
    1,
    1,
    0,
    "postgres",
    true,
    false
  ],
  "televoting.external_score_entry_log": [
    11,
    1,
    1,
    1,
    0,
    "postgres",
    true,
    false
  ]
});
const FIELDS = Object.freeze(['schema_name','object_name','object_kind','owner_name','rls_enabled','rls_forced','acl_md5','column_count','columns_md5','constraint_count','constraints_md5','index_count','indexes_md5','policy_count','policies_md5','trigger_count','triggers_md5']);
const DIGESTS = new Set(['acl_md5','columns_md5','constraints_md5','indexes_md5','policies_md5','triggers_md5']);
const COUNTS = new Set(['column_count','constraint_count','index_count','policy_count','trigger_count']);
const MD5 = /^[a-f0-9]{32}$/;
const id = r => r.schema_name+'.'+r.object_name;

export function compareFifty(frozen, local) {
  if (!frozen || !local || frozen.pg_version_num!==170011 || local.pg_version_num!==170011
      || !Array.isArray(frozen.relations) || frozen.relations.length!==215
      || !Array.isArray(frozen.routines) || frozen.routines.length!==727
      || !Array.isArray(local.relations) || local.relations.length!==50) {
    throw Error('S06 fail closed: exact PG17.11, frozen 215/727 and 50 local relations required');
  }
  const names = new Set(Object.keys(S06_FIFTY));
  if (names.size!==50) throw Error('S06 malformed fixed fifty-table catalog');
  const expected = new Map();
  for (const r of frozen.relations) {
    if (expected.has(id(r))) throw Error('S06 duplicate frozen relation: '+id(r));
    expected.set(id(r),r);
  }
  const actual = new Map();
  for (const r of local.relations) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw Error('S06 malformed local relation');
    const key=id(r);
    if (!names.has(key)||actual.has(key)) throw Error('S06 unexpected or duplicate local relation: '+key);
    actual.set(key,r);
  }
  const mismatches=[];
  for (const [name,[col,con,idx,pol,trg,owner,rls,forced]] of Object.entries(S06_FIFTY)) {
    const a=actual.get(name),e=expected.get(name);
    if (!a || !e || e.object_kind!=='r' || e.column_count!==col ||
        e.constraint_count!==con || e.index_count!==idx || e.policy_count!==pol ||
        e.trigger_count!==trg || e.owner_name!==owner || e.rls_enabled!==rls || e.rls_forced!==forced) {
      throw Error('S06 frozen 50-relation contract missing or altered: '+name);
    }
    if (Object.keys(a).length!==FIELDS.length || FIELDS.some(f=>!(f in a))) {
      throw Error('S06 malformed 17-field local fingerprint: '+name);
    }
    for (const f of FIELDS) {
      if (DIGESTS.has(f) && (!MD5.test(e[f]) || !MD5.test(a[f]))) throw Error('S06 corrupt digest '+name+'.'+f);
      if (COUNTS.has(f) && (!Number.isInteger(a[f]) || a[f]<0)) throw Error('S06 invalid count '+name+'.'+f);
      if (a[f]!==e[f]) mismatches.push(name+'.'+f);
    }
  }
  return {
    task: 'S06', status:mismatches.length?'FIFTY_METADATA_DRIFT_BLOCKED':'FIFTY_METADATA_PARITY_NOT_CERTIFIED',
    equal:mismatches.length===0, newTableIdentities:50, existingIntegratedNames:100,
    combinedFixtureRelationNamesAfterIntegration:150, hostedPhysicalRelations:215,
    remainingUnmodeledNamesOutside150:65, hostedRoutineIdentities:727,
    newRoutineBehaviorCertified:false, fullHostedEquivalenceCertified:false,
    productionMigrationAuthorized:false, deploymentAuthorized:false, releaseAuthorized:false,
    mismatches, hostedQueriesByVerifier:0, hostedMutationsByVerifier:0,
    limitations:'Fifty 17-field table fingerprints only, 56 original scoped checks and 44 earlier full-field checks; trigger placeholders do not prove runtime function semantics; 65 relations and 727 routine/role/extension/data/history equivalence remain uncertified.'
  };
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length!==5) throw Error('Usage: node verify-fifty <frozen215.json> <local50.json> <report.json>');
    const [frozenFile,localFile,outputFile]=process.argv.slice(2).map(resolve);
    if (new Set([frozenFile,localFile,outputFile]).size!==3) throw Error('S06 output cannot overwrite input');
    const report=compareFifty(JSON.parse(readFileSync(frozenFile,'utf8')),JSON.parse(readFileSync(localFile,'utf8')));
    writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(report));
    if(!report.equal)process.exitCode=1;
  } catch (err) { console.error('S06 blocked: '+err.message);process.exitCode=2; }
}
