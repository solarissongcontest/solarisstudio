#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s5-acknowledgement] %s\n' "$*"; }
fail() { printf '[v3-s5-acknowledgement] ERROR: %s\n' "$*" >&2; exit 1; }

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@127.0.0.1:*/*|postgres://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_DB_URL must be loopback" ;;
esac

USER_ID='00000000-0000-4000-8000-00000000a971'
OTHER_USER_ID='00000000-0000-4000-8000-00000000a972'
EDITION_ID='00000000-0000-4000-8000-00000000e971'
COUNTRY_ID='00000000-0000-4000-8000-00000000c971'
NOTICE_ID='00000000-0000-4000-8000-00000000b971'

db_exec() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }
as_user_value() {
  local user_id="$1" query="$2"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$user_id'; set request.jwt.claim.role='authenticated'; $query" | tail -n1 | tr -d '\r'
}
as_user_fails() {
  local user_id="$1" query="$2"
  if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$user_id'; set request.jwt.claim.role='authenticated'; $query" >/dev/null 2>&1; then
    return 1
  fi
}

log "Seed one published required notice and its eligible recipient"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at) values
  ('$USER_ID','authenticated','authenticated','s5-ack-owner@local.invalid',now(),now()),
  ('$OTHER_USER_ID','authenticated','authenticated','s5-ack-other@local.invalid',now(),now());
insert into public.editions(id,name,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Acknowledgement','s5-acknowledgement',99521,'active',false);
insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','S5 Ack Country','S5A');
insert into public.country_accounts(user_id,country_id,status,display_name)
values ('$USER_ID'::uuid,'$COUNTRY_ID'::uuid,'active','Acknowledgement Owner');
insert into public.studio2_official_notices(
  id,edition_id,notice_type,title,body,severity,audience,country_ids,
  acknowledgement_required,status,sent_at,created_by,updated_by,display_surfaces
) values (
  '$NOTICE_ID','$EDITION_ID','official_notice','Required acknowledgement',
  'Read and acknowledge this local rehearsal notice.','action_required',
  'all_delegations','{}'::uuid[],true,'published',now(),
  '$USER_ID'::uuid,'$USER_ID'::uuid,array['delegation_inbox']::text[]
);
"

[[ "$(db_value "select count(*) from public.studio2_notice_receipts where notice_id='$NOTICE_ID'::uuid and recipient_user_id='$USER_ID'::uuid and acknowledged_at is null;")" == '1' ]] || fail "published notice did not materialize one unacknowledged recipient receipt"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='acknowledgement.recorded' and payload->>'noticeId'='$NOTICE_ID';")" == '0' ]] || fail "migration fabricated historical acknowledgement event"

log "First acknowledgement records one immutable receipt, operation and DomainEvent"
FIRST_ACK="$(as_user_value "$USER_ID" "select (public.studio2_acknowledge_notice('$NOTICE_ID'::uuid)).acknowledged_at::text;")"
[[ -n "$FIRST_ACK" ]] || fail "first acknowledgement returned no timestamp"
OPERATION_ID="$(db_value "select operation_id::text from public.studio2_operation_receipts where command='acknowledgement.record' and actor_id='$USER_ID'::uuid and result->>'noticeId'='$NOTICE_ID' limit 1;")"
[[ -n "$OPERATION_ID" ]] || fail "acknowledgement operation receipt missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='acknowledgement.recorded' and aggregate_type='acknowledgement' and aggregate_version=1;")" == '1' ]] || fail "acknowledgement.recorded fact missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and (payload ? 'recipientUserId' or payload ? 'userId' or payload ? 'actorId');")" == '0' ]] || fail "acknowledgement DomainEvent leaked recipient identity"
[[ "$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='notice.acknowledged' and actor_user_id='$USER_ID'::uuid and entity_id='$NOTICE_ID';")" == '1' ]] || fail "legacy acknowledgement compatibility event missing"

log "Exact retry is a semantic no-op"
SECOND_ACK="$(as_user_value "$USER_ID" "select (public.studio2_acknowledge_notice('$NOTICE_ID'::uuid)).acknowledged_at::text;")"
[[ "$SECOND_ACK" == "$FIRST_ACK" ]] || fail "exact retry rewrote acknowledged_at"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where command='acknowledgement.record' and actor_id='$USER_ID'::uuid and result->>'noticeId'='$NOTICE_ID';")" == '1' ]] || fail "exact retry duplicated acknowledgement operation"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='acknowledgement.recorded' and payload->>'noticeId'='$NOTICE_ID';")" == '1' ]] || fail "exact retry duplicated acknowledgement.recorded"
[[ "$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='notice.acknowledged' and actor_user_id='$USER_ID'::uuid and entity_id='$NOTICE_ID';")" == '1' ]] || fail "exact retry duplicated legacy acknowledgement event"

log "Acknowledgement evidence cannot be rewritten after the fact"
db_exec "update public.studio2_notice_receipts set acknowledged_at=now()+interval '1 hour' where notice_id='$NOTICE_ID'::uuid and recipient_user_id='$USER_ID'::uuid;"
[[ "$(db_value "select acknowledged_at::text from public.studio2_notice_receipts where notice_id='$NOTICE_ID'::uuid and recipient_user_id='$USER_ID'::uuid;")" == "$FIRST_ACK" ]] || fail "service maintenance rewrote immutable acknowledgement timestamp"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='acknowledgement.recorded' and payload->>'noticeId'='$NOTICE_ID';")" == '1' ]] || fail "timestamp rewrite attempt duplicated acknowledgement fact"

log "A non-recipient cannot acknowledge another recipient's notice"
as_user_fails "$OTHER_USER_ID" "select public.studio2_acknowledge_notice('$NOTICE_ID'::uuid);" || fail "non-recipient acknowledgement unexpectedly succeeded"
[[ "$(db_value "select count(*) from public.studio2_notice_receipts where notice_id='$NOTICE_ID'::uuid and recipient_user_id='$OTHER_USER_ID'::uuid;")" == '0' ]] || fail "non-recipient gained a receipt"

log "Ownerless direct acknowledgement writes fail closed"
db_exec "insert into public.studio2_notice_receipts(notice_id,recipient_user_id,delivered_at,opened_at) values ('$NOTICE_ID'::uuid,'$OTHER_USER_ID'::uuid,now(),now()) on conflict do nothing;"
if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "update public.studio2_notice_receipts set acknowledged_at=now() where notice_id='$NOTICE_ID'::uuid and recipient_user_id='$OTHER_USER_ID'::uuid;" >/dev/null 2>&1; then
  fail "ownerless direct acknowledgement unexpectedly succeeded"
fi
[[ "$(db_value "select acknowledged_at is null from public.studio2_notice_receipts where notice_id='$NOTICE_ID'::uuid and recipient_user_id='$OTHER_USER_ID'::uuid;")" == 't' ]] || fail "ownerless rejected acknowledgement mutated receipt"

log "System V3 S5 acknowledgement consequence rehearsal passed"
