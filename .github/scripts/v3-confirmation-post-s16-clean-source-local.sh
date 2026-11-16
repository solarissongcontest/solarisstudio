#!/usr/bin/env bash
set -euo pipefail
# TEST ONLY: apply the EXISTING System-owned S16 grant-retirement statement
# to a disposable clean-source Supabase, then use the existing Confirmation
# positive lifecycle. Never rewrite or run the complete recovery SQL here.
[[ "${SOLARIS_VERIFICATION_TARGET:-}" == local ]] || { echo "Refusing non-local S16 authority check" >&2; exit 1; }
eval "$(supabase status -o env)"
: "${DB_URL:?Missing disposable DB_URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) echo "Refusing hosted database connection: not loopback disposable Supabase" >&2; exit 1 ;;
esac
# Extract the exact cutover from the forward-only System owner artifact.
# Require exact reviewed original Confirmation DML plus separate ten-table TRUNCATE scope;
# fail closed on altered or extra REVOKE statements.
python3 - <<'PY' > /tmp/v3-s16-clean-confirmation-grant.sql
from pathlib import Path
import re
s=Path('docs/v3/recovery-candidates/s16-launch-table-truncate-cutover.sql').read_text()
expected=(
  'revoke insert,update,delete,truncate,references,trigger,maintain on table\n'
  ' public.submissions,\n'
  ' public.edit_tokens\n'
  ' from public,anon,authenticated,service_role;'
)
additional=(
  'revoke truncate on table\n'
  ' public.country_accounts,\n'
  ' public.editions,\n'
  ' public.entries,\n'
  ' public.jury_votes,\n'
  ' public.results,\n'
  ' public.shows,\n'
  ' public.studio2_result_operations,\n'
  ' public.studio2_show_publication_controls,\n'
  ' public.studio2_upload_authorizations,\n'
  ' televoting.vote_submissions\n'
  ' from public,anon,authenticated,service_role;'
)
results=(
  'revoke insert,update,delete,references,trigger,maintain on table public.results\n'
  ' from public,anon,authenticated,service_role;'
)
publication=(
  'revoke insert,update,delete,truncate,references,trigger,maintain on table\n'
  ' public.studio2_show_publication_controls,\n'
  ' public.studio2_show_publication_executions\n'
  ' from public,anon,authenticated,service_role;'
)
# This script must remain Confirmation-only. It merely validates that the
# source file also contains independently reviewed Results and publication DML retirement;
# the complete stage and Results acceptance run in the networkless PG17 job.
if (s.count(expected)!=1 or s.count(additional)!=1 or s.count(results)!=1
    or s.count(publication)!=1 or len(re.findall(r'(?im)^revoke\s+',s))!=4):
    raise SystemExit('Refusing unreviewed S16 Confirmation/Results grant retirement')
print(expected)
PY
# Record the actual local-source SELECT contract before privilege retirement.
# Some roles legitimately have NO SELECT, unlike the hosted-observed snapshot.
# Source-recovery must preserve existing reads, not create extra ones.
read_contract() {
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt -c "
    select string_agg(
      tab || ':' || api_role || ':' || has_table_privilege(api_role,tab,'SELECT')::text,
      '|' order by tab,api_role)
    from unnest(array['public.submissions','public.edit_tokens']) as tables(tab)
    cross join unnest(array['anon','authenticated','service_role']) as roles(api_role);"
}
source_select_before="$(read_contract)"
# This is a local permission-effect rehearsal, not installation of the full
# production S16 preflight (which requires a NONSUPERUSER PG17.11 operator).
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f /tmp/v3-s16-clean-confirmation-grant.sql >/dev/null
[[ "$(read_contract)" == "$source_select_before" ]] || { echo 'S16 altered existing Confirmation read authority' >&2; exit 1; }
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $verify$
declare r text; t text; privilege text;
begin
  foreach t in array array['public.submissions','public.edit_tokens'] loop
    foreach r in array array['anon','authenticated','service_role'] loop
      foreach privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(r,t,privilege) then
          raise exception 'S16 clean-source direct writer remains % % %',r,t,privilege;
        end if;
      end loop;
    end loop;
  end loop;
end $verify$;
SQL
echo 'PASS: exact System-owned S16 grant restriction applied on disposable clean-source Supabase; proceeding to real governed Confirmation lifecycle'
