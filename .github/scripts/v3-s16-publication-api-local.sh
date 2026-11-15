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
pub_bootstrap_sql -f - <<'SQL'
insert into auth.users(id,aud,role,email,created_at,updated_at)
values('71000000-0000-4000-8000-000000000001','authenticated','authenticated','publication-s16@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
values('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001',now(),now(),'aal1',now()+interval '1 hour');
SQL
pub_owner_sql -f - <<'SQL'
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
('71000000-0000-4000-8000-000000000001','publishing.manage','51000000-0000-4000-8000-000000000001'),
('71000000-0000-4000-8000-000000000001','publishing.publish','51000000-0000-4000-8000-000000000001');
SQL
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
  v_show uuid := '51000000-0000-4000-8000-000000000002';
  v_operation uuid := '71000000-0000-4000-8000-000000000003';
  v_preview jsonb;
  v_applied jsonb;
  v_retry jsonb;
  v_config jsonb := '{"results":true}'::jsonb;
begin
  v_preview := public.studio2_show_publication_change_preview(v_show,'hidden',v_config,null);
  if (v_preview->>'expectedVersion')::bigint < 1 then
     raise exception 'S16 publication preview lacked a version';
  end if;
  v_applied := public.studio2_apply_show_publication_change(
     v_show,'hidden',v_config,null,v_operation,v_operation::text,
     (v_preview->>'expectedVersion')::bigint
  );
  if v_applied->>'state' is distinct from 'hidden' then
    raise exception 'S16 publication canonical change failed: %',v_applied;
  end if;
  v_preview := public.studio2_show_publication_change_preview(v_show,'hidden',v_config,null);
  v_retry := public.studio2_apply_show_publication_change(
     v_show,'hidden',v_config,null,v_operation,v_operation::text,
     (v_preview->>'expectedVersion')::bigint
  );
  if coalesce((v_retry->>'alreadyApplied')::boolean,false) is distinct from true then
    raise exception 'S16 publication replay did not recover committed state: %',v_retry;
  end if;
  raise notice 'PASS: canonical authenticated publication change and retry after S16 cutover';
end $publication$;
rollback;
SQL
[[ "$(operator_state_digest recovery_publication_api_probe)" == "$before_publication_probe" ]] || { echo 'Publication probe changed durable fixture state' >&2; exit 1; }
# The scheduled publisher remains exposed ONLY through its explicit
# service_role EXECUTE grant; revoked table DML must not prevent invocation.
pub_client_sql -c 'begin; set local role service_role; select public.studio2_publish_due_show_publications(); rollback;' > /tmp/s16-due-publication.log
[[ "$(operator_state_digest recovery_publication_api_probe)" == "$before_publication_probe" ]] || { echo 'Due-publication probe changed durable fixture state' >&2; exit 1; }
operator_sql -c 'drop database recovery_publication_api_probe;'
echo 'PASS: authenticated canonical publication, replay and service-role due operation retain owner authority after API DML cutover'
