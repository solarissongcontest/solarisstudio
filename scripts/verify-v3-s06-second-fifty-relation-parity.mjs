#!/usr/bin/env node
// S06: strict, offline second-fifty (150->200) relation verification against immutable hosted metadata.
// The positive verifier checks ACTUAL local pg_catalog JSON in CI, not DDL source claims.
// No application rows, network, hosted test connections or release authority.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const S06_SECOND_FIFTY = Object.freeze({
  "public.admin_beta_test_submissions": [
    11,
    3,
    2,
    2,
    2,
    "postgres",
    true,
    false
  ],
  "public.admin_deadlines": [
    11,
    4,
    3,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.admin_preferences": [
    7,
    4,
    1,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.app_push_subscriptions": [
    10,
    3,
    3,
    4,
    1,
    "postgres",
    true,
    false
  ],
  "public.beta2_test_submissions": [
    18,
    2,
    2,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.beta3_test_submissions": [
    11,
    8,
    2,
    2,
    2,
    "postgres",
    true,
    false
  ],
  "public.beta_test_submissions": [
    11,
    3,
    2,
    2,
    2,
    "postgres",
    true,
    false
  ],
  "public.content_events": [
    12,
    2,
    2,
    5,
    1,
    "postgres",
    true,
    false
  ],
  "public.country_design_presets": [
    8,
    5,
    1,
    4,
    1,
    "postgres",
    true,
    false
  ],
  "public.country_edition_identities": [
    7,
    5,
    2,
    2,
    2,
    "postgres",
    true,
    false
  ],
  "public.country_font_assets": [
    9,
    6,
    2,
    3,
    1,
    "postgres",
    true,
    false
  ],
  "public.country_hod_edition_claims": [
    5,
    5,
    3,
    4,
    1,
    "postgres",
    true,
    false
  ],
  "public.country_media": [
    8,
    3,
    3,
    5,
    1,
    "postgres",
    true,
    false
  ],
  "public.country_profiles": [
    13,
    2,
    1,
    5,
    2,
    "postgres",
    true,
    false
  ],
  "public.delegation_hod_assignments": [
    10,
    7,
    5,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.delegation_people": [
    6,
    4,
    2,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.edit_tokens": [
    9,
    3,
    2,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.fan_event_reads": [
    3,
    3,
    1,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.fan_follows": [
    8,
    4,
    2,
    1,
    3,
    "postgres",
    true,
    false
  ],
  "public.fan_profiles": [
    9,
    4,
    1,
    4,
    2,
    "postgres",
    true,
    false
  ],
  "public.fan_taste_ballots": [
    6,
    4,
    4,
    4,
    2,
    "postgres",
    true,
    false
  ],
  "public.fantasy_game_entries": [
    5,
    3,
    1,
    2,
    1,
    "postgres",
    true,
    false
  ],
  "public.fantasy_games": [
    14,
    11,
    5,
    2,
    1,
    "postgres",
    true,
    false
  ],
  "public.fantasy_team_entries": [
    5,
    4,
    1,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.fantasy_teams": [
    12,
    5,
    4,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.friend_voting_settings": [
    27,
    8,
    1,
    0,
    2,
    "postgres",
    true,
    false
  ],
  "public.integration_events": [
    15,
    4,
    4,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.integration_links": [
    11,
    6,
    5,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.integrity_identity_disclosure_requests": [
    11,
    6,
    3,
    0,
    2,
    "postgres",
    true,
    false
  ],
  "public.notification_preferences": [
    10,
    3,
    1,
    4,
    1,
    "postgres",
    true,
    false
  ],
  "public.prediction_consensus_snapshots": [
    6,
    4,
    2,
    0,
    1,
    "postgres",
    true,
    false
  ],
  "public.prediction_entries": [
    10,
    5,
    3,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.prediction_rounds": [
    10,
    5,
    2,
    5,
    2,
    "postgres",
    true,
    false
  ],
  "public.prediction_scores": [
    6,
    4,
    1,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.public_ia_rollout_state": [
    5,
    4,
    1,
    2,
    1,
    "postgres",
    true,
    false
  ],
  "public.public_televote_country_contributions": [
    12,
    3,
    1,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.public_web_vitals": [
    11,
    9,
    4,
    2,
    1,
    "postgres",
    true,
    false
  ],
  "public.studio2_capability_grants": [
    7,
    6,
    6,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.studio2_delegation_settings": [
    6,
    5,
    3,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.studio2_feature_flags": [
    8,
    3,
    2,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.studio2_prediction_round_versions": [
    3,
    3,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.studio2_prediction_score_versions": [
    3,
    3,
    1,
    0,
    0,
    "postgres",
    true,
    false
  ],
  "public.studio2_role_assignments": [
    7,
    7,
    6,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.submission_browser_sessions": [
    5,
    3,
    2,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.submission_drafts": [
    12,
    5,
    2,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "public.submission_ip_history": [
    5,
    3,
    2,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "public.user_roles": [
    4,
    2,
    2,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "televoting.admin_audit_log": [
    10,
    1,
    3,
    1,
    1,
    "postgres",
    true,
    false
  ],
  "televoting.external_score_entries": [
    9,
    3,
    2,
    1,
    2,
    "postgres",
    true,
    false
  ],
  "televoting.vote_moderation_events": [
    12,
    2,
    4,
    1,
    1,
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

export function compareSecondFifty(frozen, local) {
  if (!frozen || !local || frozen.pg_version_num!==170011 || local.pg_version_num!==170011
      || !Array.isArray(frozen.relations) || frozen.relations.length!==215
      || !Array.isArray(frozen.routines) || frozen.routines.length!==727
      || !Array.isArray(local.relations) || local.relations.length!==50) {
    throw Error('S06 fail closed: exact PG17.11, frozen 215/727 and 50 local relations required');
  }
  const names = new Set(Object.keys(S06_SECOND_FIFTY));
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
  for (const [name,[col,con,idx,pol,trg,owner,rls,forced]] of Object.entries(S06_SECOND_FIFTY)) {
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
    task: 'S06', status:mismatches.length?'SECOND_FIFTY_METADATA_DRIFT_BLOCKED':'SECOND_FIFTY_METADATA_PARITY_NOT_CERTIFIED',
    equal:mismatches.length===0, newTableIdentities:50, existingIntegratedNames:150,
    combinedFixtureRelationNamesAfterIntegration:200, hostedPhysicalRelations:215,
    remainingUnmodeledNamesOutside200:15, hostedRoutineIdentities:727,
    newRoutineBehaviorCertified:false, fullHostedEquivalenceCertified:false,
    productionMigrationAuthorized:false, deploymentAuthorized:false, releaseAuthorized:false,
    mismatches, hostedQueriesByVerifier:0, hostedMutationsByVerifier:0,
    limitations:'Second fifty 17-field table fingerprints only, 56 original scoped checks and 94 earlier full-field checks; 15 remaining relations and 727 routine/role/extension/data/history equivalence remain uncertified. Runtime placeholder functions and policy decisions are not proved.'
  };
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length!==5) throw Error('Usage: node verify-fifty <frozen215.json> <local50.json> <report.json>');
    const [frozenFile,localFile,outputFile]=process.argv.slice(2).map(p=>resolve(p));
    if (new Set([frozenFile,localFile,outputFile]).size!==3) throw Error('S06 output cannot overwrite input');
    const report=compareSecondFifty(JSON.parse(readFileSync(frozenFile,'utf8')),JSON.parse(readFileSync(localFile,'utf8')));
    writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(report));
    if(!report.equal)process.exitCode=1;
  } catch (err) { console.error('S06 blocked: '+err.message);process.exitCode=2; }
}
