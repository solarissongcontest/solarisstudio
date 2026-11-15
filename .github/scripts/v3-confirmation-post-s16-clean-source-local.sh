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
# Strictly refuse duplicate/changed grants or additions to the scope.
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
if s.count(expected)!=1 or len(re.findall(r'(?im)^revoke\s+',s))!=1:
    raise SystemExit('Refusing unreviewed S16 Confirmation DML grant retirement')
print(expected)
PY
# This is a local permission-effect rehearsal, not installation of the full
# production S16 preflight (which requires a NONSUPERUSER PG17.11 operator).
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f /tmp/v3-s16-clean-confirmation-grant.sql >/dev/null
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
do $verify$
declare r text; t text; privilege text;
begin
  foreach t in array array['public.submissions','public.edit_tokens'] loop
    foreach r in array array['anon','authenticated','service_role'] loop
      if not has_table_privilege(r,t,'SELECT') then
        raise exception 'S16 clean source lost legitimate Confirmation SELECT % %',r,t;
      end if;
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
