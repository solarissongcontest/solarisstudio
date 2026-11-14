# Sourced only by the existing networkless PG17.11 recovery workflow.
# Never a production migration runner. Synthetic fixture bootstrap is separate
# from the observed NONSUPERUSER recovery operator.
[[ "${cid:-}" =~ ^[0-9a-f]{64}$ ]] || exit 1
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]] || exit 1
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]] || exit 1
operator_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d recovery_operator_baseline "$@"; }
bootstrap_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U solaris_recovery_bootstrap -d recovery_operator_baseline "$@"; }
node scripts/stage-v3-hosted-result-sync.mjs > /tmp/observed-sync.sql
operator_sql -f - < /tmp/observed-sync.sql
node scripts/stage-v3-public-snapshot-recovery.mjs --local-helpers > /tmp/pub-helpers.sql
operator_sql -f - < /tmp/pub-helpers.sql
node scripts/stage-v3-public-snapshot-recovery.mjs --local-qualification-helpers > /tmp/qualification.sql
operator_sql -f - < /tmp/qualification.sql
operator_sql -f - < /tmp/auth-uid-authority-local.sql
operator_sql -f - < /tmp/round-invalidation-authority-local.sql
operator_sql -f - < .github/tests/v3-atomic-observed-grants-local.sql
operator_sql -c "grant truncate,references,trigger on table public.studio2_result_operations to service_role; grant truncate,references,trigger,maintain on table public.studio2_show_publication_controls to service_role; create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"
node scripts/stage-v3-recovery-owner-local.mjs > /tmp/owner-profile.sql
operator_sql -f - < /tmp/owner-profile.sql
[[ "$(operator_sql -c "select (not rolsuper and rolbypassrls)::text from pg_roles where rolname=current_user")" == true ]] || exit 1
# Compare full LOCAL synthetic schema and rows after denial, not only object counts.
operator_state_digest() {
  docker exec "$cid" pg_dump -U postgres -d "${1:-recovery_operator_baseline}" --no-comments --restrict-key=ObservedOwnerLocalOnly |
    sha256sum | awk '{print $1}'
}
operator_apply() {
  local owner_candidate="$1" owner_before owner_after
  owner_before="$(operator_state_digest)"
  python3 - "$owner_candidate" > /tmp/owner-interrupted.sql <<'PYOWNER'
import re,sys
source=open(sys.argv[1]).read()
ends=list(re.finditer(r'(?im)^commit;\s*$',source))
if not ends: raise SystemExit('No transactional candidate terminator')
end=ends[-1].start()
print(source[:end]+"do $stop$ begin raise exception 'SOLARIS_OWNER_INTERRUPTION'; end $stop$;\n"+source[end:])
PYOWNER
  if operator_sql -f - < /tmp/owner-interrupted.sql > /tmp/owner-interrupted.log 2>&1; then
    echo 'ERROR: interrupted owner installation committed'; exit 1
  fi
  grep -Fq 'SOLARIS_OWNER_INTERRUPTION' /tmp/owner-interrupted.log
  [[ "$(operator_state_digest)" == "$owner_before" ]] || { echo 'Owner interruption changed schema/data'; exit 1; }
  operator_sql -f - < "$owner_candidate"
  owner_after="$(operator_state_digest)"
  if operator_sql -f - < "$owner_candidate" > /tmp/owner-duplicate.log 2>&1; then
    echo 'ERROR: duplicate recovery unexpectedly accepted'; exit 1
  fi
  grep -Eq 'already|partial|drift|requires|precondition' /tmp/owner-duplicate.log
  [[ "$(operator_state_digest)" == "$owner_after" ]] || { echo 'Duplicate owner install changed schema/data'; exit 1; }
}
operator_apply docs/v3/recovery-candidates/forward-only-s13-foundation.sql
operator_apply docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql
operator_apply /tmp/s07-ordered-source.sql
operator_sql -f - < .github/tests/v3-hosted-api-role-runtime.sql
operator_sql -f - < .github/tests/v3-ordered-televote-recovery.sql
operator_apply /tmp/atomic-recovery.sql
bootstrap_sql -f - < .github/tests/v3-atomic-calculation-actor.sql
operator_sql -v snapshot_before=true -f - < .github/tests/v3-public-snapshot-recovery.sql
operator_sql -f - < .github/tests/v3-voting-config-authority.sql
operator_apply /tmp/public-snapshot-recovery.sql
operator_sql -v snapshot_before=false -f - < .github/tests/v3-public-snapshot-recovery.sql
# Restore canonical Results rank/qualification and reconciliation only after
# the existing capture/read model, with separate exact observed fingerprints.
node scripts/stage-v3-result-authority-recovery.mjs > /tmp/result-authority-recovery.sql
owner_acl_before="$(operator_state_digest)"
operator_sql -c 'revoke execute on function public.sync_show_results_from_votes(uuid) from service_role;'
owner_acl_drift="$(operator_state_digest)"
if operator_sql -f - < /tmp/result-authority-recovery.sql > /tmp/result-authority-drift.log 2>&1; then exit 1; fi
grep -Fq 'Result authority drift or partial installation' /tmp/result-authority-drift.log
[[ "$(operator_state_digest)" == "$owner_acl_drift" ]] || exit 1
operator_sql -c 'grant execute on function public.sync_show_results_from_votes(uuid) to service_role;'
[[ "$(operator_state_digest)" == "$owner_acl_before" ]] || exit 1
operator_apply /tmp/result-authority-recovery.sql
operator_sql -f - < .github/tests/v3-result-authority-recovery.sql
echo 'PASS: entire ordered recovery executes as observed NONSUPERUSER postgres with real role/schema privileges'
# A restore of synthetic local data proves this procedure, NOT availability,
# freshness, retention or restorability of the separate real production backup.
owner_restored_before="$(operator_state_digest)"
docker exec "$cid" pg_dump -Fc -U solaris_recovery_bootstrap -d recovery_operator_baseline > /tmp/observed-owner-synthetic.dump
bootstrap_sql -c 'create database recovery_restore_probe owner postgres template template0;'
docker exec -i "$cid" pg_restore --exit-on-error --single-transaction -U solaris_recovery_bootstrap -d recovery_restore_probe < /tmp/observed-owner-synthetic.dump
[[ "$(operator_state_digest recovery_restore_probe)" == "$owner_restored_before" ]] || { echo 'Restored synthetic database differs'; exit 1; }
restored_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d recovery_restore_probe "$@"; }
restored_sql -f - < .github/tests/v3-hosted-api-role-runtime.sql
restored_sql -f - < .github/tests/v3-ordered-televote-recovery.sql
restored_sql -v snapshot_before=false -f - < .github/tests/v3-public-snapshot-recovery.sql
restored_sql -f - < .github/tests/v3-voting-config-authority.sql
restored_sql -f - < .github/tests/v3-result-authority-recovery.sql
[[ "$(operator_state_digest recovery_restore_probe)" == "$owner_restored_before" ]] || { echo 'Restored runtime tests changed durable evidence'; exit 1; }
echo 'PASS: synthetic pg_dump/pg_restore into separate local DB preserves full schema, ACLs and rows; restored authority/snapshots pass'
OWNER_SOURCE_SHA="$EXACT_SHA" node --input-type=module <<'PROOF'
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=process.env.OWNER_SOURCE_SHA;
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Missing exact source SHA');
const files=[
 'docs/v3/recovery-candidates/forward-only-s13-foundation.sql',
 'docs/v3/recovery-candidates/forward-only-s14-archive-integrated-local.sql',
 '/tmp/s07-ordered-source.sql','/tmp/atomic-recovery.sql','/tmp/public-snapshot-recovery.sql','/tmp/result-authority-recovery.sql',
];
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync('observed-owner-recovery-proof.json',JSON.stringify({
 sourceSha:sha,postgresVersion:'17.11',network:'none',portsPublished:false,
 observedProductionProject:'dkxmnvekiopyesuzggeu',
 recoveryOperator:{role:'postgres',superuser:false,bypassRls:true},
 observedRoleAttributes:16,observedSchemas:5,
 orderedStages:files.map((path,i)=>({order:i+1,path,sha256:digest(path)})),
 interruptedRollback:true,safeRetry:true,duplicateRefused:true,
 schemaAndSyntheticRowsPreserved:true,separateLocalRestoreVerified:true,
 productionBackupVerified:false,hostedEquivalenceCertified:false,
 productionMutation:false,productionAuthorized:false,
},null,2)+'\n',{flag:'wx'});
PROOF
