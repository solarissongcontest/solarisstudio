# Sourced only by the existing networkless PG17.11 recovered fixture driver.
set -euo pipefail
owner_media_parent="${owner_media_parent:-recovery_operator_baseline}"
case "$owner_media_parent" in recovery_operator_baseline|media_recovery_operator_probe) ;; *) exit 1;; esac
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]]
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]]
SOLARIS_S02_TARGET=local node scripts/stage-v3-media-prerequisites-local.mjs --bootstrap > /tmp/media-storage-selected.sql
bootstrap_sql -f - < /tmp/media-storage-selected.sql
SOLARIS_S02_TARGET=local node scripts/stage-v3-media-prerequisites-local.mjs > /tmp/media-authority-helpers.sql
operator_sql -f - < /tmp/media-authority-helpers.sql
operator_apply supabase/migrations/20261115204228_v3_media_finalization_authority.sql
operator_sql -c "create database security_media_probe owner postgres template $owner_media_parent;"
# Source-defined reference data, only inside this synthetic disposable clone.
node --input-type=module > /tmp/media-reference-fixture.sql <<'JS'
import fs from 'node:fs';const s=fs.readFileSync('supabase/migrations/20260914035152_permission_engine_v2_foundation.sql','utf8');for(const t of ['studio2_capabilities','studio2_access_roles']){const a=s.indexOf('insert into public.'+t);if(a<0)throw Error('Missing reference seed');console.log(s.slice(a,s.indexOf(';',a)+1));}
JS
docker exec -i "$cid" psql -X -U postgres -d security_media_probe -qAt -v ON_ERROR_STOP=1 < /tmp/media-reference-fixture.sql
docker exec -i "$cid" psql -X -U postgres -d security_media_probe -qAt -v ON_ERROR_STOP=1 -c "insert into public.studio2_platform_operational_state(singleton,mode,version,reason)values(true,'normal',1,'Synthetic Media acceptance only')on conflict(singleton)do update set mode='normal',version=public.studio2_platform_operational_state.version+1;"
# Fixture Auth rows are written by their actual owner, never the recovery operator.
docker exec -i "$cid" psql -X -U supabase_auth_admin -d security_media_probe -qAt -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,aud,role,email,created_at,updated_at) values('27182200-0000-4000-8000-000000000001','authenticated','authenticated','media-owner@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values('27182200-0000-4000-8000-000000000011','27182200-0000-4000-8000-000000000001',now(),now());
SQL
python3 - <<'PY' > /tmp/media-owner-runtime.sql
from pathlib import Path
import re
s=Path('.github/tests/v3-media-finalization-authority.sql').read_text()
for table in ['auth.users','auth.sessions']:
 pattern=r'insert into '+re.escape(table)+r'\([^;]+;\n'
 s,n=re.subn(pattern,'',s,count=1)
 if n!=1:raise SystemExit('Missing source Auth fixture insertion')
print(s)
PY
docker exec -i "$cid" psql -X -U postgres -d security_media_probe -qAt -v ON_ERROR_STOP=1 < /tmp/media-owner-runtime.sql
docker exec -i "$cid" psql -X -U authenticator -d security_media_probe -qAt -v ON_ERROR_STOP=1 < .github/tests/v3-media-direct-api-denial.sql
media_policy_before="$(operator_state_digest security_media_probe)"
if docker exec -i "$cid" psql -X -U postgres -d security_media_probe -qAt -v ON_ERROR_STOP=1 < docs/v3/recovery-candidates/media-storage-policy-owner-cutover.sql > /tmp/media-policy-denial.log 2>&1;then exit 1;fi
grep -Fq 'actual Storage table owner' /tmp/media-policy-denial.log
[[ "$(operator_state_digest security_media_probe)" == "$media_policy_before" ]]
operator_sql -c "create database security_media_policy_probe owner postgres template $owner_media_parent;"
SOLARIS_S02_TARGET=local node scripts/stage-v3-media-prerequisites-local.mjs --owner-policy-fixture > /tmp/media-owner-policy-fixture.sql
docker exec -i "$cid" psql -X -U solaris_recovery_bootstrap -d security_media_policy_probe -qAt -v ON_ERROR_STOP=1 < /tmp/media-owner-policy-fixture.sql
operator_sql -c 'create database security_media_policy_drift owner postgres template security_media_policy_probe;'
docker exec -i "$cid" psql -X -U supabase_storage_admin -d security_media_policy_drift -qAt -v ON_ERROR_STOP=1 -c 'alter policy "country media bucket owner delete" on storage.objects using(true);'
media_policy_drift="$(operator_state_digest security_media_policy_drift)"
if docker exec -i "$cid" psql -X -U supabase_storage_admin -d security_media_policy_drift -qAt -v ON_ERROR_STOP=1 < docs/v3/recovery-candidates/media-storage-policy-owner-cutover.sql > /tmp/media-policy-drift.log 2>&1;then exit 1;fi
grep -Fq 'Media Storage policy drift' /tmp/media-policy-drift.log
[[ "$(operator_state_digest security_media_policy_drift)" == "$media_policy_drift" ]]
docker exec -i "$cid" psql -X -U supabase_storage_admin -d security_media_policy_probe -qAt -v ON_ERROR_STOP=1 < docs/v3/recovery-candidates/media-storage-policy-owner-cutover.sql
media_policy_after="$(operator_state_digest security_media_policy_probe)"
if docker exec -i "$cid" psql -X -U supabase_storage_admin -d security_media_policy_probe -qAt -v ON_ERROR_STOP=1 < docs/v3/recovery-candidates/media-storage-policy-owner-cutover.sql > /tmp/media-policy-duplicate.log 2>&1;then exit 1;fi
grep -Fq 'already-applied cutover' /tmp/media-policy-duplicate.log
[[ "$(operator_state_digest security_media_policy_probe)" == "$media_policy_after" ]]
operator_sql -c 'drop database security_media_policy_drift;'
operator_sql -c 'drop database security_media_policy_probe;'
operator_sql -c 'drop database security_media_probe;'
echo 'PASS: Media nonsuperuser recovery, role denial, governed byte receipts/replay/revocation; Storage owner-only step verifies exact policies and refuses postgres/drift/duplicate'
echo 'LIMIT: Storage selected metadata is synthetic/provider-source; actual Storage service/bytes remain unverified; owner-only cutover requires separate privileged execution'
