#!/usr/bin/env bash
# Source from v3-observed-owner-recovery-local.sh after the System S16 cutover.
# Network-isolated disposable PG17.11 only. No hosted connection or data.
set -euo pipefail
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]] || exit 1
[[ "$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$cid")" == '{}' ]] || exit 1
operator_sql -c 'create database recovery_publication_api_probe owner postgres template recovery_operator_baseline;'
pub_owner_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d recovery_publication_api_probe "$@"; }
# Supabase Auth parent tables are owned outside the reviewed non-superuser
# postgres migration role. Only synthetic user/session seeding uses the
# already-provisioned isolated bootstrap owner; all cutover and real API-role
# behavior remains under the non-superuser/operator/authenticator roles.
pub_bootstrap_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U solaris_recovery_bootstrap -d recovery_publication_api_probe "$@"; }
pub_client_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U authenticator -d recovery_publication_api_probe "$@"; }
# Seed the SAME historical/publication fixture as the Results RLS proof,
# without weakening the saved test expectations or changing its upstream file.
python3 - <<'PYSEED' > /tmp/s16-publication-prepare.sql
from pathlib import Path
s=Path('.github/tests/v3-public-snapshot-recovery.sql').read_text()
a=s.index('begin;',s.index('\\else'))
b=s.index('update public.editions set published=true',a)
source=s[a:b]
if source.count('update public.studio2_show_publication_controls set')!=1:
    raise SystemExit('S16 publication seed drift')
if source.count('update public.shows set published=true')!=1:
    raise SystemExit('S16 publication seed show drift')
print(source+'commit;')
PYSEED
pub_owner_sql -f - < /tmp/s16-publication-prepare.sql
# Create a dedicated new draft show for the positive publication command.
# Do not repurpose the existing frozen Results source: that source has no
# reviewed/locked/reveal-ready result-version provenance and must stay intact.
# A participants-only publication requires no invented Results version.
pub_owner_sql -f - <<'SQL'
begin;
insert into public.shows(id,edition_id,name,kind,published,publication_config)
values('71000000-0000-4000-8000-000000000010',
       '51000000-0000-4000-8000-000000000001',
       'S16 publication command positive fixture','semi-final',false,'{}'::jsonb);
insert into public.studio2_show_publication_controls(
  show_id,edition_id,state,version,frozen_config,source_show_updated_at
)
select id,edition_id,'draft',1,'{}'::jsonb,updated_at
from public.shows where id='71000000-0000-4000-8000-000000000010'
on conflict (show_id) do nothing;
do $fixture_check$
begin
  if not exists (
    select 1 from public.studio2_show_publication_controls c
    join public.shows s on s.id=c.show_id
    where c.show_id='71000000-0000-4000-8000-000000000010'
      and c.state='draft' and c.source_result_version is null
      and s.published=false
  ) then raise exception 'Local publication draft fixture drift'; end if;
end $fixture_check$;
commit;
SQL
pub_bootstrap_sql -f - <<'SQL'
insert into auth.users(id,aud,role,email,created_at,updated_at)
values('71000000-0000-4000-8000-000000000001','authenticated','authenticated','publication-s16@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
values('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001',now(),now(),'aal1',now()+interval '1 hour');
SQL
pub_owner_sql -f - <<'SQL'
-- The bounded S02 fixture omits permission-engine seed rows even though the
-- schema is present. Reproduce the two immutable published capability keys
-- from the canonical 20260914035152 foundation, only in this disposable DB.
insert into public.studio2_capabilities(key,domain,label,description,access_level) values
 ('publishing.manage','publishing','Manage publishing','Configure public projections and reveal plans.','operate'),
 ('publishing.publish','publishing','Release public content','Approve public release of governed contest content.','approve')
on conflict (key) do nothing;
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
('71000000-0000-4000-8000-000000000001','publishing.manage','51000000-0000-4000-8000-000000000001'),
('71000000-0000-4000-8000-000000000001','publishing.publish','51000000-0000-4000-8000-000000000001');
SQL
# The S02 hosted-observed schema fixture is intentionally data-scoped and has
# no platform-operational state row. Seed ONLY this disposable publication probe,
# never the shared baseline or hosted environment. Refuse an existing non-normal
# state rather than silently overwriting any operational safety control.
pub_owner_sql -f - <<'SQL'
do $fixture_mode$
begin
  if to_regclass('public.studio2_platform_operational_state') is null then
    raise exception 'S16 publication probe missing platform state schema';
  end if;
  if not exists (
    select 1 from public.studio2_platform_operational_state
    where singleton = true
  ) then
    insert into public.studio2_platform_operational_state(
      singleton, mode, version, reason
    ) values (true, 'normal', 1, 'S16 disposable publication probe');
  end if;
  if not exists (
    select 1 from public.studio2_platform_operational_state
    where singleton = true and mode = 'normal'
  ) then
    raise exception 'S16 publication probe refuses non-normal platform mode';
  end if;
end $fixture_mode$;
SQL
# Compare the exact disposable pg_dump if transaction rollback unexpectedly
# changes fixture state. Synthetic-only diagnostic; never connect to hosted.
pub_dump() {
  docker exec "$cid" pg_dump -U postgres -d recovery_publication_api_probe \
    --no-comments --restrict-key=ObservedOwnerLocalOnly
}
pub_dump > /tmp/s16-publication-probe-before.sql
before_publication_probe="$(operator_state_digest recovery_publication_api_probe)"
# A REAL authenticator session assumes an authenticated API role with a fresh
# local Auth session. The governed RPC must still change publication state,
# provide a retry-safe response and retain its receipt after table ACL cutover.
pub_client_sql -f - <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
 'sub','71000000-0000-4000-8000-000000000001',
 'role','authenticated',
 'session_id','71000000-0000-4000-8000-000000000002',
 'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())))
)::text,true);
do $publication$
declare
  v_show uuid := '71000000-0000-4000-8000-000000000010';
  v_operation uuid := '71000000-0000-4000-8000-000000000003';
  v_preview jsonb;
  v_applied jsonb;
  v_retry jsonb;
  v_config jsonb := '{"participants":true}'::jsonb;
begin
  v_preview := public.studio2_show_publication_change_preview(v_show,'public',v_config,null);
  if (v_preview->>'expectedVersion')::bigint < 1 then
     raise exception 'S16 publication preview lacked a version';
  end if;
  v_applied := public.studio2_apply_show_publication_change(
     v_show,'public',v_config,null,v_operation,v_operation::text,
     (v_preview->>'expectedVersion')::bigint
  );
  if v_applied->>'state' is distinct from 'public' then
    raise exception 'S16 publication canonical change failed: %',v_applied;
  end if;
  v_preview := public.studio2_show_publication_change_preview(v_show,'public',v_config,null);
  v_retry := public.studio2_apply_show_publication_change(
     v_show,'public',v_config,null,v_operation,v_operation::text,
     (v_preview->>'expectedVersion')::bigint
  );
  if coalesce((v_retry->>'alreadyApplied')::boolean,false) is distinct from true then
    raise exception 'S16 publication replay did not recover committed state: %',v_retry;
  end if;
  raise notice 'PASS: canonical authenticated publication change and retry after S16 cutover';
end $publication$;
rollback;
SQL
# PostgreSQL nextval() is deliberately non-transactional: canonical
# publication audit allocates exactly one synthetic admin audit identifier,
# even when the command's transaction rolls back. Compare entire pg_dump
# schema/data while allowing ONLY that observed, bounded sequence transition.
pub_dump > /tmp/s16-publication-probe-after.sql
python3 - <<'PYSEQ'
from pathlib import Path
import difflib
import sys
before = Path('/tmp/s16-publication-probe-before.sql').read_text()
after = Path('/tmp/s16-publication-probe-after.sql').read_text()
old_seq = "SELECT pg_catalog.setval('public.admin_audit_log_id_seq', 1, false);"
new_seq = "SELECT pg_catalog.setval('public.admin_audit_log_id_seq', 1, true);"
if before.count(old_seq) != 1 or after.count(new_seq) != 1:
    raise SystemExit('S16 publication rollback unexpected audit-sequence state')
normalized_after = after.replace(new_seq, old_seq, 1)
if normalized_after != before:
    print('S16 publication rollback changed data/schema beyond the single audited sequence advance', file=sys.stderr)
    for line in list(difflib.unified_diff(before.splitlines(), normalized_after.splitlines()))[:120]:
        print(line, file=sys.stderr)
    raise SystemExit(1)
print('PASS: publication rollback preserved schema/data, with only the expected nontransactional audit-sequence advance')
PYSEQ
# Unlike the earlier rollback-only fixture, this verifies a committed
# canonical publication operation, a durable receipt, and an independent
# session readback. This disposable database is deleted below. Nothing runs
# against production Supabase or the shared recovery baseline.
pub_client_sql -f - <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
 'sub','71000000-0000-4000-8000-000000000001',
 'role','authenticated',
 'session_id','71000000-0000-4000-8000-000000000002',
 'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())))
)::text,true);
do $committed$
declare
  v_show uuid := '71000000-0000-4000-8000-000000000010';
  v_operation uuid := '71000000-0000-4000-8000-000000000005';
  v_preview jsonb;
  v_applied jsonb;
begin
  v_preview := public.studio2_show_publication_change_preview(
    v_show,'public','{"participants":true}'::jsonb,null
  );
  if (v_preview->>'alreadyApplied')::boolean is true then
    raise exception 'S16 committed positive fixture is already published';
  end if;
  v_applied := public.studio2_apply_show_publication_change(
    v_show,'public','{"participants":true}'::jsonb,null,
    v_operation,'s16-publication-committed-receipt',
    (v_preview->>'expectedVersion')::bigint
  );
  if v_applied->>'state' is distinct from 'public'
     or (v_applied->>'alreadyApplied')::boolean is distinct from false
     or (v_applied->>'operationId')::uuid is distinct from v_operation then
    raise exception 'S16 committed publication operation returned wrong receipt: %',v_applied;
  end if;
end $committed$;
commit;
SQL
pub_owner_sql -f - <<'SQL'
do $persisted_receipt$
declare
  v_show uuid := '71000000-0000-4000-8000-000000000010';
  v_operation uuid := '71000000-0000-4000-8000-000000000005';
begin
  if not exists (
    select 1 from public.studio2_show_publication_controls c
    join public.shows s on s.id=c.show_id
    where c.show_id=v_show and c.state='public' and c.version=2
      and c.frozen_config->>'participants'='true'
      and s.published and s.publication_config->>'participants'='true'
  ) then raise exception 'S16 committed publication canonical readback missing'; end if;
  if (select count(*) from public.studio2_operation_receipts
      where operation_id=v_operation and actor_id='71000000-0000-4000-8000-000000000001'
        and idempotency_key='s16-publication-committed-receipt'
        and command='publication.show.change' and status='succeeded'
        and result->>'state'='public'
        and (result->>'operationId')::uuid=v_operation
        and completed_at is not null) <> 1
  then raise exception 'S16 committed publication receipt not durably persisted'; end if;
  if (select count(*) from public.admin_audit_log
      where actor_id='71000000-0000-4000-8000-000000000001'
        and table_name='studio2_show_publication_controls'
        and record_id=v_show::text
        and action='show_publication_state_changed') <> 1
  then raise exception 'S16 publication canonical audit trail missing or duplicated'; end if;
end $persisted_receipt$;
SQL
# Reconnect independently: an already-completed action must not allocate
# another durable receipt, audit entry, or version transition.
pub_client_sql -f - <<'SQL'
begin;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object(
 'sub','71000000-0000-4000-8000-000000000001',
 'role','authenticated',
 'session_id','71000000-0000-4000-8000-000000000002',
 'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())))
)::text,true);
do $replay$
declare v_result jsonb;
begin
  v_result := public.studio2_apply_show_publication_change(
    '71000000-0000-4000-8000-000000000010',
    'public','{"participants":true}'::jsonb,null,
    '71000000-0000-4000-8000-000000000005',
    's16-publication-committed-receipt',2
  );
  if coalesce((v_result->>'alreadyApplied')::boolean,false) is not true
     or v_result->>'state' is distinct from 'public'
  then raise exception 'S16 cross-session replay was not idempotent: %',v_result; end if;
end $replay$;
commit;
SQL
pub_owner_sql -f - <<'SQL'
do $replay_readback$
begin
  if (select count(*) from public.studio2_operation_receipts
      where operation_id='71000000-0000-4000-8000-000000000005') <> 1
     or (select version from public.studio2_show_publication_controls
       where show_id='71000000-0000-4000-8000-000000000010') <> 2
     or (select count(*) from public.admin_audit_log
       where action='show_publication_state_changed'
         and record_id='71000000-0000-4000-8000-000000000010') <> 1
  then raise exception 'S16 cross-session replay duplicated the canonical operation'; end if;
end $replay_readback$;
SQL
# A role without an Auth subject cannot commandeer the existing publication.
pub_client_sql -f - <<'SQL'
begin;
set local role authenticated;
do $denied$
begin
  begin
    perform public.studio2_apply_show_publication_change(
      '71000000-0000-4000-8000-000000000010',
      'hidden','{}'::jsonb,null,
      '71000000-0000-4000-8000-000000000006','s16-unauthorized',
      2
    );
    raise exception 'S16 unauthenticated caller changed publication';
  exception when insufficient_privilege then
    null;
  end;
end $denied$;
rollback;
SQL
echo 'PASS: persisted canonical Publication receipt, readback, separate-session replay and unauthorized denial'

after_publication_probe="$(operator_state_digest recovery_publication_api_probe)"
# The scheduled publisher remains exposed ONLY through its explicit
# service_role EXECUTE grant; revoked table DML must not prevent invocation.
pub_client_sql -c 'begin; set local role service_role; select public.studio2_publish_due_show_publications(); rollback;' > /tmp/s16-due-publication.log
[[ "$(operator_state_digest recovery_publication_api_probe)" == "$after_publication_probe" ]] || { echo 'Due-publication probe changed durable fixture state' >&2; exit 1; }
operator_sql -c 'drop database recovery_publication_api_probe;'
echo 'PASS: authenticated canonical publication, replay and service-role due operation retain owner authority after API DML cutover'
