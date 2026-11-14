set -euo pipefail
# Sourced after recovery in the existing networkless container. Commit synthetic
# setup only in a temporary clone, so clients use real independent sessions.
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid")" == none ]] || exit 1
owner_api_parent="${owner_api_parent:-recovery_operator_baseline}"
case "$owner_api_parent" in recovery_operator_baseline|recovery_restore_probe) ;; *) exit 1 ;; esac
operator_sql -c "create database recovery_api_probe owner postgres template \"$owner_api_parent\";"
api_owner_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U postgres -d recovery_api_probe "$@"; }
api_client_sql() { docker exec -i "$cid" psql -w -X -qAt -v ON_ERROR_STOP=1 -U authenticator -d recovery_api_probe "$@"; }
# Reuse the existing, source-controlled before/after snapshot fixture setup;
# stop before its owner-session SET ROLE checks, which are not API RLS proof.
python3 - <<'PYAPI' > /tmp/result-api-prepare.sql
from pathlib import Path
s=Path('.github/tests/v3-public-snapshot-recovery.sql').read_text()
a=s.index('begin;',s.index('\\else'))
b=s.index('update public.editions set published=true',a)
print(s[a:b]+'commit;')
PYAPI
api_owner_sql -f - < /tmp/result-api-prepare.sql
# Publishing a show can automatically publish its edition. Explicitly model
# the hidden-edition boundary rather than assuming the fixture remains hidden.
api_owner_sql -c "update public.editions set published=false where id='51000000-0000-4000-8000-000000000001';"
api_client_sql -v published=false -f - < .github/tests/v3-result-public-api.sql
api_owner_sql -c "update public.editions set published=true where id='51000000-0000-4000-8000-000000000001';"
api_client_sql -v published=true -f - < .github/tests/v3-result-public-api.sql
api_owner_sql -c "update public.participants set participation_status='withdrawn' where country_id='51000000-0000-4000-8000-000000000011' and edition_id='51000000-0000-4000-8000-000000000001';"
api_client_sql -v published=true -f - < .github/tests/v3-result-public-api.sql
operator_sql -c 'drop database recovery_api_probe;'
echo 'PASS: publication RLS uses actual authenticator sessions and preserves frozen meaning after mutable participation changes'
