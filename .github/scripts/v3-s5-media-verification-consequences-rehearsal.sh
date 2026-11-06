#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-media-verification] %s\n' "$*"; }
fail() { printf '\n[v3-s5-media-verification] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

ACTOR_ID='00000000-0000-4000-8000-000000009941'
COUNTRY_ID='00000000-0000-4000-8000-00000000c941'
EDITION_ID='00000000-0000-4000-8000-00000000e941'
COUNTRY_UPLOAD_ID='00000000-0000-4000-8000-00000000a941'
EDITION_UPLOAD_ID='00000000-0000-4000-8000-00000000a942'
BETA_UPLOAD_ID='00000000-0000-4000-8000-00000000a943'
ACTORLESS_UPLOAD_ID='00000000-0000-4000-8000-00000000a944'

log "Seeding local Media verification scopes"
db_exec "
insert into auth.users(
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '$ACTOR_ID','authenticated','authenticated','v3-s5-media-verified@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;

insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','S5 Media Country','S5M');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Media Verification',2026,'s5-media-verification',9941,'active',false);

insert into public.studio2_upload_authorizations(
  id,actor_id,domain,entity_id,scope,final_bucket,quarantine_path,final_path,
  original_name,declared_mime,expected_size,authorization_secret,status,context,expires_at
) values
(
  '$COUNTRY_UPLOAD_ID','$ACTOR_ID','country_media','$COUNTRY_ID','gallery','country-media',
  '$COUNTRY_UPLOAD_ID/$COUNTRY_UPLOAD_ID.png','$COUNTRY_ID/gallery/$COUNTRY_UPLOAD_ID.png',
  'country.png','image/png',128,'local-country-capability','prepared','{}'::jsonb,now()+interval '10 minutes'
),
(
  '$EDITION_UPLOAD_ID','$ACTOR_ID','edition_artwork','$EDITION_ID',null,'edition-artwork',
  '$EDITION_UPLOAD_ID/$EDITION_UPLOAD_ID.webp','$EDITION_ID/$EDITION_UPLOAD_ID.webp',
  'edition.webp','image/webp',256,'local-edition-capability','prepared','{}'::jsonb,now()+interval '10 minutes'
),
(
  '$BETA_UPLOAD_ID',null,'beta_feedback',null,null,'beta-feedback',
  '$BETA_UPLOAD_ID/$BETA_UPLOAD_ID.png','public/$BETA_UPLOAD_ID.png',
  'feedback.png','image/png',64,'local-beta-capability','prepared','{}'::jsonb,now()+interval '10 minutes'
),
(
  '$ACTORLESS_UPLOAD_ID',null,'country_media','$COUNTRY_ID','gallery','country-media',
  '$ACTORLESS_UPLOAD_ID/$ACTORLESS_UPLOAD_ID.png','$COUNTRY_ID/gallery/$ACTORLESS_UPLOAD_ID.png',
  'actorless.png','image/png',64,'local-actorless-capability','prepared','{}'::jsonb,now()+interval '10 minutes'
);
"

VERIFY_META="jsonb_build_object(
  'signatureVerified',true,
  'quarantineVerified',true,
  'processing','decoded_oriented_stripped_reencoded',
  'publicationDecision','published_after_verification'
)"

log "Country Media verification emits one durable media.verified fact"
db_exec "
update public.studio2_upload_authorizations
set status='verified',detected_mime='image/png',verified_metadata=$VERIFY_META,
    rejection_reason=null,finalized_at=now()
where id='$COUNTRY_UPLOAD_ID'::uuid and status='prepared';
"
COUNTRY_EVENT="$(db_value "select id::text from private.v3_domain_events where event_type='media.verified' and aggregate_id='$COUNTRY_UPLOAD_ID' order by occurred_at desc limit 1;")"
[[ -n "$COUNTRY_EVENT" ]] || fail "country Media verification did not emit media.verified"
[[ "$(db_value "select aggregate_type || ':' || aggregate_version::text from private.v3_domain_events where id='$COUNTRY_EVENT'::uuid;")" == 'media_asset:1' ]] || fail "media.verified aggregate provenance is wrong"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts receipt join private.v3_domain_events event on event.operation_id=receipt.operation_id where event.id='$COUNTRY_EVENT'::uuid and receipt.command='media.finalize_upload' and receipt.risk_class='R1' and receipt.status='succeeded';")" == '1' ]] || fail "media.finalize_upload operation receipt is missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$COUNTRY_EVENT'::uuid;")" == '0' ]] || fail "successful media.verified fabricated task/outbox work"
[[ "$(db_value "select count(*) from private.v3_domain_events where id='$COUNTRY_EVENT'::uuid and (payload ? 'actorId' or payload ? 'authorizationSecret' or payload ? 'originalName');")" == '0' ]] || fail "media.verified leaked private upload identity or capability metadata"

log "Exact verified-row replay does not duplicate the completed fact"
db_exec "update public.studio2_upload_authorizations set finalized_at=finalized_at where id='$COUNTRY_UPLOAD_ID'::uuid;"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='media.verified' and aggregate_id='$COUNTRY_UPLOAD_ID';")" == '1' ]] || fail "replay duplicated media.verified"

log "Edition artwork preserves edition scope"
db_exec "
update public.studio2_upload_authorizations
set status='verified',detected_mime='image/webp',verified_metadata=$VERIFY_META,
    rejection_reason=null,finalized_at=now()
where id='$EDITION_UPLOAD_ID'::uuid and status='prepared';
"
EDITION_EVENT="$(db_value "select id::text from private.v3_domain_events where event_type='media.verified' and aggregate_id='$EDITION_UPLOAD_ID';")"
[[ -n "$EDITION_EVENT" ]] || fail "edition artwork verification did not emit media.verified"
[[ "$(db_value "select edition_id::text from private.v3_domain_events where id='$EDITION_EVENT'::uuid;")" == "$EDITION_ID" ]] || fail "edition artwork media.verified lost edition scope"

log "Shared quarantine beta feedback remains outside Media event ownership"
db_exec "
update public.studio2_upload_authorizations
set status='verified',detected_mime='image/png',verified_metadata=$VERIFY_META,
    rejection_reason=null,finalized_at=now()
where id='$BETA_UPLOAD_ID'::uuid and status='prepared';
"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='media.verified' and aggregate_id='$BETA_UPLOAD_ID';")" == '0' ]] || fail "beta feedback fabricated media.verified"

log "Media verification fails closed if an authenticated Media authorization lost its actor"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  update public.studio2_upload_authorizations
  set status='verified',detected_mime='image/png',verified_metadata=$VERIFY_META,
      rejection_reason=null,finalized_at=now()
  where id='$ACTORLESS_UPLOAD_ID'::uuid and status='prepared';
" >/dev/null 2>&1; then
  fail "actorless Media verification unexpectedly succeeded"
fi
[[ "$(db_value "select status from public.studio2_upload_authorizations where id='$ACTORLESS_UPLOAD_ID'::uuid;")" == 'prepared' ]] || fail "actorless verification failure did not roll back durable status"

log "System V3 S5 Media verification consequence rehearsal passed"
