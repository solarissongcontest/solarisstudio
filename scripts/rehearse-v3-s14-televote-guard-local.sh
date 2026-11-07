#!/usr/bin/env bash
# Isolated local S14 regression test; NEVER touch hosted Supabase.
set -euo pipefail
[[ "${SOLARIS_RUN_LOCAL_DB_REHEARSAL:-}" == YES ]] || { echo 'LOCAL rehearsal opt-in required' >&2; exit 2; }
[[ "${SOLARIS_VERIFICATION_TARGET:-}" == local ]] || { echo 'LOCAL verification target required' >&2; exit 2; }
[[ "${SOLARIS_LOCAL_DB_PORT:-}" =~ ^[0-9]{4,5}$ ]] || exit 2
(( SOLARIS_LOCAL_DB_PORT >= 1024 && SOLARIS_LOCAL_DB_PORT <= 65535 )) || exit 2
for key in DATABASE_URL POSTGRES_URL SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN PGSERVICE PGSERVICEFILE PGHOSTADDR PGHOST; do
  [[ -z "${!key:-}" ]] || { echo "FAIL CLOSED: remote credential or host $key" >&2; exit 2; }
done
command -v psql >/dev/null
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PGHOST=127.0.0.1 PGHOSTADDR=127.0.0.1 PGPORT="$SOLARIS_LOCAL_DB_PORT" PGUSER=postgres
export PGPASSWORD="${SOLARIS_LOCAL_DB_PASSWORD:-postgres}" PGSSLMODE=disable PGCONNECT_TIMEOUT=5
unset PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE
args=(psql -w -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -h 127.0.0.1 -p "$PGPORT" -U postgres)
db="solaris_v3_s14guard_local_$$"
baseline="${db}_historical"
admin() { "${args[@]}" -d postgres "$@"; }
run() { "${args[@]}" -d "$db" "$@"; }
historical() { "${args[@]}" -d "$baseline" "$@"; }
created=no
cleanup() {
  [[ "$created" == yes ]] || return 0
  admin -c "drop database $baseline with (force)" >/dev/null
  admin -c "drop database $db with (force)" >/dev/null
}
trap cleanup EXIT

admin -c 'do $roles$ begin
  if not exists (select 1 from pg_roles where rolname='"'"'anon'"'"') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='"'"'authenticated'"'"') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='"'"'service_role'"'"') then create role service_role nologin; end if;
end $roles$;' >/dev/null
admin -c "create database $db" >/dev/null
created=yes
fixture="$root/docs/v3/recovery-candidates/fixtures/s14-televote-guard-catalog-subset-local.sql"
candidate="$root/docs/v3/recovery-candidates/forward-only-s14-televote-provenance-guard-local.sql"
historical_guard="$root/supabase/migrations/20261017001010_v3_s14_televote_projection_guard_hardening.sql"
for f in "$fixture" "$candidate" "$historical_guard"; do [[ -f "$f" ]] || exit 2; done
run -f "$fixture" >/dev/null
admin -c "create database $baseline template $db" >/dev/null

run -f "$candidate" >/dev/null
historical -f "$candidate" >/dev/null
# Replace the enhanced guard in the comparison DB with the unmodified
# historic 20261017001010 SQL. This is NOT run against production.
historical -f "$historical_guard" >/dev/null

show_managed="'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'"
show_legacy="'cccccccc-cccc-4ccc-8ccc-cccccccccccc'"
vote_managed="'dddddddd-dddd-4ddd-8ddd-dddddddddddd'"
vote_legacy="'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'"
edition="'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"
source_insert="insert into private.v3_televote_result_projection_sources(
 show_id,edition_id,source_type,source_id,source_version,source_published_at,
 payload_fingerprint,row_count,points_total,projection_revision
) values(
 $show_managed,$edition,'round','local-publication',1,now(),repeat('a',64),1,12,1
)"
run -c "$source_insert" >/dev/null
historical -c "$source_insert" >/dev/null

expect_block() {
  local query="$1" label="$2"
  local output
  if output="$(run -c "$query" 2>&1)"; then
    echo "FAIL: protected published Televote modification accepted ($label)" >&2; exit 1;
  fi
  if [[ "$output" != *"Published Televote projection is server-managed for this show"* ]]; then
    echo "FAIL: unexpected Televote guard failure ($label): $output" >&2; exit 1;
  fi
}
# Current session_user is POSTGRES despite SET ROLE authenticated.
# The historical source guard allowed that login bypass; the candidate must NOT.
expect_block "set role authenticated; update public.televote_votes
 set points=99 where id=$vote_managed" "managed points"
expect_block "set role authenticated; delete from public.televote_votes
 where id=$vote_managed" "managed delete"
expect_block "set role authenticated; insert into public.televote_votes(
 id,edition_id,show_id,country_id,points
 ) values('ffffffff-ffff-4fff-8fff-ffffffffffff',$edition,$show_managed,
 '33333333-3333-4333-8333-333333333333',5)" "managed insert"
expect_block "set role authenticated; update public.televote_votes
 set show_id=$show_legacy where id=$vote_managed" "move managed to unmanaged"
expect_block "set role authenticated; update public.televote_votes
 set show_id=$show_managed where id=$vote_legacy" "move unmanaged to managed"
expect_block "set role authenticated; update public.televote_votes
 set show_id=null where id=$vote_managed" "remove managed show scope"
expect_block "set role authenticated;
 select set_config('request.jwt.claim.role','service_role',true);
 select set_config('solaris.v3_televote_projection_write','1',true);
 update public.televote_votes set points=100 where id=$vote_managed" "forged claim and marker"

# Proof that this is a REAL regression: original hardened 01010 guard
# allows an UPDATE leaving a source-managed show because it inspects only NEW.
historical -c "set role authenticated; update public.televote_votes
 set show_id=$show_legacy where id=$vote_managed" >/dev/null
historical_show="$(historical -c "select show_id from public.televote_votes where id=$vote_managed")"
[[ "$historical_show" == "cccccccc-cccc-4ccc-8ccc-cccccccccccc" ]] || {
  echo 'FAIL: historical old-show bypass not reproduced' >&2; exit 1;
}

# A legacy, non-provenance-managed show must retain legacy write behavior
# in the deliberately permissive synthetic RLS setup.
run -c "set role authenticated; update public.televote_votes
 set points=8 where id=$vote_legacy" >/dev/null
legacy_points="$(run -c "select points from public.televote_votes where id=$vote_legacy")"
[[ "$legacy_points" == 8 ]] || {
  echo "FAIL: unprotected legacy vote changed incorrectly: $legacy_points" >&2; exit 1;
}

# A positive properly marked service identity may still perform the
# canonical server-managed write, with result-sync consequence count.
run -c "set role service_role;
 select set_config('request.jwt.claim.role','service_role',false);
 update public.televote_votes set points=13 where id=$vote_managed" >/dev/null
managed_points="$(run -c "select points from public.televote_votes where id=$vote_managed")"
[[ "$managed_points" == 13 ]] || {
  echo "FAIL: canonical service update failed: $managed_points" >&2; exit 1;
}

# Untrusted clients must not read or write provenance directly.
if run -c "set role authenticated; select * from private.v3_televote_result_projection_sources" >/dev/null 2>&1; then
 echo 'FAIL: authenticated role can read source provenance' >&2; exit 1
fi
if run -c "set role authenticated; insert into private.v3_televote_result_projection_sources(
 show_id,edition_id,source_type,source_id,source_version,source_published_at,
 payload_fingerprint,row_count,points_total,projection_revision
 ) values($show_legacy,$edition,'round','fake',1,now(),repeat('b',64),1,1,1)" >/dev/null 2>&1; then
 echo 'FAIL: authenticated role forged a source provenance row' >&2; exit 1
fi

# The row-guard prevents AFTER trigger result-sync side effects.
# Two baseline inserts + one legacy update + one service update = exactly 4.
n_sync="$(run -c "select count(*) from private.local_vote_sync_counter")"
[[ "$n_sync" == 4 ]] || {
 echo "FAIL: unauthorized Televote attempts affected result sync ($n_sync)" >&2; exit 1
}
n_votes="$(run -c "select count(*) from public.televote_votes")"
[[ "$n_votes" == 2 ]] || {
 echo "FAIL: vote ledger changed unexpectedly ($n_votes)" >&2; exit 1
}

# Double apply must fail closed without overwriting the already installed guard.
if run -f "$candidate" >/dev/null 2>&1; then
 echo 'FAIL: repeat S14 guard candidate bypassed preflight' >&2; exit 1
fi
if run -c "select count(*) from private.v3_televote_result_projection_sources" | grep -qx 1; then :; else
 echo 'FAIL: candidate replay changed source provenance records' >&2; exit 1
fi
echo 'PASS: S14 local PG17.11 provenance guard, 6 denied writes, legacy continuity, service path, role/ACL, old->new scope regression, idempotent refusal and downstream sync isolation'
echo 'PASS: forged JWT claim and custom marker do not authorize projection writes; published-results source synchronizers and full production RLS remain separately scoped.'
