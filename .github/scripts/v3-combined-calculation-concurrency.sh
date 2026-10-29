#!/usr/bin/env bash
set -euo pipefail
: "${DB_URL:?loopback DB_URL required}"
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) echo 'Refusing non-local calculation concurrency proof' >&2; exit 1;; esac
proof_dir="$(mktemp -d)"
aggregation_id="$(python3 -c 'import uuid; print(uuid.uuid4())')"
cleanup() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q <<SQL >/dev/null
begin;
delete from public.integration_events where remote_id='$aggregation_id';
-- Immutable audit evidence remains until the disposable database is reset.
delete from public.studio2_operation_receipts where actor_id='29072852-0000-4000-8000-000000000001';
delete from televoting.televote_aggregations where id='$aggregation_id';
delete from public.studio2_role_assignments where user_id='29072852-0000-4000-8000-000000000001';
delete from auth.users where id='29072852-0000-4000-8000-000000000001';
commit;
SQL
  rm -rf "$proof_dir"
}
trap cleanup EXIT
# Only the setup portion is committed so two real database sessions can race.
sed "/select set_config('test.calc.version'/,\$d" .github/tests/v3-combined-calculation-authority.sql > "$proof_dir/setup.sql"
sed -i "s/29072852-0000-4000-8000-000000000071/$aggregation_id/g" "$proof_dir/setup.sql"
echo 'commit;' >> "$proof_dir/setup.sql"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -f "$proof_dir/setup.sql"
version="$(psql "$DB_URL" -X -Atq -c "select command_version from televoting.televote_aggregations where id='$aggregation_id'")"
for n in 1 2; do
  cat > "$proof_dir/$n.sql" <<SQL
begin;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29072852-0000-4000-8000-000000000001","session_id":"29072852-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select televoting.v3_calculate_combined('$aggregation_id',$version,'29072852-0000-4000-8000-00000000070$n','concurrent:$n');
commit;
SQL
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$proof_dir/$n.sql" > "$proof_dir/$n.log" 2>&1 &
  pids[$n]=$!
done
set +e
wait "${pids[1]}"; first=$?
wait "${pids[2]}"; second=$?
set -e
if [[ "$first:$second" != 0:3 && "$first:$second" != 3:0 ]]; then cat "$proof_dir/1.log" "$proof_dir/2.log"; exit 1; fi
rg -q VERSION_CONFLICT "$proof_dir/1.log" "$proof_dir/2.log"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q <<SQL
do \$assert\$ begin
 if (select calculation_version from televoting.televote_aggregations where id='$aggregation_id')<>1 or (select count(*) from public.integration_events where remote_id='$aggregation_id' and event_type='combined.calculated')<>1 then raise exception 'Concurrent calculation duplicated state or event'; end if;
end \$assert\$;
SQL
echo 'PASS: two concurrent calculations yield one commit, one CAS rejection and one consequence'
