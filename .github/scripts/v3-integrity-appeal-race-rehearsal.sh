#!/usr/bin/env bash
set -euo pipefail
# Disposable local fixtures only. No hosted fallback or database repair.
eval "$(supabase status -o env)"
case "${API_URL:-}" in http://127.0.0.1:*|http://localhost:*) ;; *) echo 'Refusing non-local Integrity rehearsal' >&2; exit 1;; esac
case "${DB_URL:-}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local Integrity database' >&2; exit 1;; esac
scratch_dir=$(mktemp -d)
trap 'rm -rf "$scratch_dir"' EXIT
# Reuse the reviewed intake/assignment fixture and its negative checks. Commit
# only fixture setup, so two independent PostgreSQL sessions can see the appeal.
python3 - "$scratch_dir/setup.sql" <<'PY'
from pathlib import Path
import sys
source=Path('.github/tests/v3-integrity-appeal-recovery.sql').read_text()
setup=source.split("do $foreign_reviewer$",1)[0]
# Distinct namespace avoids the rollback-only contract fixture and other lanes.
setup=setup.replace('28111828-','28115600-').replace('APPEAL-RECOVERY','APPEAL-RACE').replace('@local.invalid','-race@local.invalid')
Path(sys.argv[1]).write_text(setup+'\nreset role;\ncommit;\n')
PY
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$scratch_dir/setup.sql" > "$scratch_dir/setup.log"
appeal_id=$(psql "$DB_URL" -X -Atq -v ON_ERROR_STOP=1 -c "select id from public.integrity_case_appeals where sanction_id='28115600-0000-4000-8000-000000000041'")
[[ "$appeal_id" =~ ^[a-f0-9-]{36}$ ]] || { echo 'Appeal fixture missing' >&2; exit 1; }
cat > "$scratch_dir/winner.sql" <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"28115600-0000-4000-8000-000000000002","session_id":"28115600-0000-4000-8000-000000000012"}';
select public.studio2_integrity_resolve_appeal('$appeal_id','reduced','Independent concurrent review supports a lower sanction.',4,'{}','{}','28115600-0000-4000-8000-000000000107','appeal-race:winner',2);
select pg_advisory_xact_lock(28115600);
select pg_sleep(5);
commit;
SQL
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$scratch_dir/winner.sql" > "$scratch_dir/winner.log" 2>&1 &
winner_pid=$!
ready=false
for _ in $(seq 1 40); do
 if [[ $(psql "$DB_URL" -X -Atq -c "select exists(select 1 from pg_locks where locktype='advisory' and objid=28115600 and granted)") == t ]]; then ready=true; break; fi
 sleep 0.1
done
[[ "$ready" == true ]] || { wait "$winner_pid"; cat "$scratch_dir/winner.log"; echo 'Winner never reached transaction barrier' >&2; exit 1; }
cat > "$scratch_dir/loser.sql" <<SQL
\set VERBOSITY verbose
begin;
set local application_name='v3_integrity_appeal_racer';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"28115600-0000-4000-8000-000000000004","session_id":"28115600-0000-4000-8000-000000000014"}';
select public.studio2_integrity_resolve_appeal('$appeal_id','overturned','A competing reviewer must never overwrite committed adjudication.',null,'{}','{}','28115600-0000-4000-8000-000000000109','appeal-race:loser',2);
commit;
SQL
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$scratch_dir/loser.sql" > "$scratch_dir/loser.log" 2>&1 &
loser_pid=$!
blocked=false
for _ in $(seq 1 30); do
 if [[ $(psql "$DB_URL" -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='v3_integrity_appeal_racer' and wait_event_type='Lock')") == t ]]; then blocked=true; break; fi
 sleep 0.1
done
wait "$winner_pid" || { cat "$scratch_dir/winner.log"; exit 1; }
if wait "$loser_pid"; then echo 'Competing appeal reviewer overwrote the winner' >&2; exit 1; fi
[[ "$blocked" == true ]] || { echo 'No concurrent lock wait observed' >&2; exit 1; }
# Only canonical stale-version / reviewer authorization denials are acceptable.
rg -q '40001|42501|P0409' "$scratch_dir/loser.log" || { cat "$scratch_dir/loser.log"; exit 1; }
cat > "$scratch_dir/verify.sql" <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"28115600-0000-4000-8000-000000000002","session_id":"28115600-0000-4000-8000-000000000012"}';
-- Lost-response replay after the OTHER transaction finished must return the
-- committed receipt, despite the old expected revision.
select public.studio2_integrity_resolve_appeal('$appeal_id','reduced','Independent concurrent review supports a lower sanction.',4,'{}','{}','28115600-0000-4000-8000-000000000107','appeal-race:winner',2);
reset role;
do \$verify\$
begin
 if not exists(select 1 from public.integrity_case_appeals where id='$appeal_id' and status='reduced' and version=3) then raise exception 'Appeal race diverged'; end if;
 if (select count(*) from public.integrity_adjudication_history where operation_id='28115600-0000-4000-8000-000000000107' and event_type='integrity.appeal_changed')<>1 then raise exception 'Race duplicated history'; end if;
 if (select count(*) from public.integrity_case_events where operation_id='28115600-0000-4000-8000-000000000107' and event_type='integrity.appeal_changed')<>1 then raise exception 'Race duplicated or lost durable event'; end if;
 if exists(select 1 from public.studio2_operation_receipts where operation_id='28115600-0000-4000-8000-000000000109') then raise exception 'Rejected reviewer committed a receipt'; end if;
 if not exists(select 1 from public.integrity_case_sanctions where id='28115600-0000-4000-8000-000000000041' and final_level=6 and rationale='Original sanction rationale retained forever') then raise exception 'Race rewrote original adjudication'; end if;
end
\$verify\$;
rollback;
SQL
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$scratch_dir/verify.sql" > "$scratch_dir/verify.log"
echo '[v3-integrity-appeal-race] PASS: observed lock serialization, one canonical transition, loser denied, post-commit receipt recovery and immutable original adjudication'
