#!/usr/bin/env bash
set -euo pipefail
log(){ printf '\n[v3-s7-entry-auth] %s\n' "$*"; }
fail(){ printf '\n[v3-s7-entry-auth] FAIL: %s\n' "$*" >&2; exit 1; }
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"; : "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local DB" ;; esac

ADMIN='00000000-0000-4000-8000-000000007001'
OWNER='00000000-0000-4000-8000-000000007002'
EA='00000000-0000-4000-8000-000000007011'
EB='00000000-0000-4000-8000-000000007012'
CA='00000000-0000-4000-8000-000000007021'
CB='00000000-0000-4000-8000-000000007022'
PB='00000000-0000-4000-8000-000000007031'

db(){ psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
scalar(){ psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
reject(){ local label="$1" sql="$2"; if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >/dev/null 2>&1; then fail "$label unexpectedly succeeded"; fi; log "PASS: $label"; }
expect(){ local label="$1" sql="$2" wanted="$3" got; got="$(scalar "$sql")"; [[ "$got" == "$wanted" ]] || fail "$label expected '$wanted', got '$got'"; log "PASS: $label"; }

log "Seed exact-object authorization fixture"
db "insert into auth.users(id,aud,role,email,created_at,updated_at) values ('$ADMIN','authenticated','authenticated','entry-admin@local.invalid',now(),now()),('$OWNER','authenticated','authenticated','entry-owner@local.invalid',now(),now()); insert into public.editions(id,name,slug,edition_number,status,published) values ('$EA','Entry A','v3-entry-a',7001,'draft',false),('$EB','Entry B','v3-entry-b',7002,'draft',false); insert into public.countries(id,name,short_code) values ('$CA','Entry Country A','E7A'),('$CB','Entry Country B','E7B'); insert into public.participants(id,edition_id,country_id,artist,song,semi_final) values ('$PB','$EB','$CB','Original B','Original Song','final'); insert into public.country_accounts(user_id,country_id,status) values ('$OWNER','$CB','active'); insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$ADMIN','entry.edit','$EA');"

log "Organizer A cannot target participant B"
reject "Organizer A cannot target participant B" "set role authenticated; select set_config('request.jwt.claim.sub','$ADMIN',false); select public.admin_upsert_country_entry('$CB','$PB','$EA',null,'Bad Artist','Bad Song',null);"
reject "Organizer link mutation cannot target participant B" "set role authenticated; select set_config('request.jwt.claim.sub','$ADMIN',false); select public.admin_update_country_entry_listen_links('$CB','$PB','$EA','https://youtu.be/dQw4w9WgXcQ',null,null);"
expect "denials preserve Entry B" "select artist from public.participants where id='$PB';" "Original B"

log "Country owner cannot override participant edition via claimed Edition A"
reject "country owner cannot smuggle participant B through Edition A" "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); select public.upsert_owned_country_entry('$PB','$EA',null,'Bad Owner','Bad Owner Song',null);"
reject "country owner link path cannot smuggle participant B" "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); select public.update_owned_country_entry_listen_links('$PB','$EA','https://youtu.be/dQw4w9WgXcQ',null,null);"
expect "owner denial preserves Entry B" "select artist from public.participants where id='$PB';" "Original B"

log "Wrong country binding is rejected"
db "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$ADMIN','entry.edit','$EB');"
reject "wrong country is rejected" "set role authenticated; select set_config('request.jwt.claim.sub','$ADMIN',false); select public.admin_upsert_country_entry('$CA','$PB','$EB',null,'Wrong Country','Wrong Song',null);"

log "Exact object plus exact capability succeeds"
db "set role authenticated; select set_config('request.jwt.claim.sub','$ADMIN',false); select public.admin_upsert_country_entry('$CB','$PB','$EB',null,'Authorized B','Authorized Song','allowed');"
expect "matching Edition B capability succeeds" "select artist from public.participants where id='$PB';" "Authorized B"
db "set role authenticated; select set_config('request.jwt.claim.sub','$OWNER',false); select public.update_owned_country_entry_listen_links('$PB','$EB','https://youtu.be/dQw4w9WgXcQ',null,null);"
expect "owner exact-edition link succeeds" "select youtube_url from public.participants where id='$PB';" "https://youtu.be/dQw4w9WgXcQ"
log "All exact Entry object authorization checks passed"
