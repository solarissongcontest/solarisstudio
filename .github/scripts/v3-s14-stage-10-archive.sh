#!/usr/bin/env bash
set -euo pipefail

archive_service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; set \"request.jwt.claims\"='{\"role\":\"service_role\"}'; $1" >/dev/null
}

archive_task_digest() {
  db_scalar "
select md5(coalesce(jsonb_agg(jsonb_build_object(
  'id',task.id,
  'sourceKey',task.source_key,
  'state',task.state,
  'priority',task.priority,
  'href',task.href,
  'requiredCapability',task.required_capability,
  'assignedTo',task.assigned_to,
  'resolvedAt',task.resolved_at
) order by task.source_key,task.id)::text,'[]'))
from public.studio2_organizer_tasks task
where task.edition_id='$EDITION_ID'::uuid or task.edition_id is null;
"
}

archive_receipt_count() {
  db_scalar "select count(*) from public.studio2_operation_receipts where status='succeeded';"
}

archive_public_result_count() {
  local show_id="$1"
  request GET "$API_URL/rest/v1/results?show_id=eq.$show_id&select=id" "$ANON_KEY" "$ANON_KEY"
  expect_success "archive history public Results $show_id"
  python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<< "$HTTP_BODY"
}

run_s14_stage_10_archive_preflight() {
  log "Stage 10 foundation: archive contract gate, task/notification stability, retained history and outage recovery"

  archive_contract_json="$(bun run scripts/check-v3-s14-archive-contract.ts --json)"
  archive_contract_ready="$(python3 -c 'import json,sys; print("true" if json.load(sys.stdin)["ready"] else "false")' <<< "$archive_contract_json")"
  archive_contract_blockers="$(python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)["blockers"]))' <<< "$archive_contract_json")"

  # Rebuild the canonical Organizer task projection and delivery projections,
  # then repeat the process. A second pass must be a semantic no-op.
  archive_service_exec "
select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);
select private.studio2_sync_task_notifications('$EDITION_ID'::uuid);
select private.studio2_prune_stale_task_notifications('$EDITION_ID'::uuid);
"
  task_digest_before="$(archive_task_digest)"
  archive_service_exec "
select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);
select private.studio2_sync_task_notifications('$EDITION_ID'::uuid);
select private.studio2_prune_stale_task_notifications('$EDITION_ID'::uuid);
"
  task_digest_after="$(archive_task_digest)"
  [[ -n "$task_digest_before" && "$task_digest_before" == "$task_digest_after" ]] || fail "Organizer Task projection is not stable under repeated canonical reconciliation"

  contradictory_notifications="$(db_scalar "
select count(*)
from public.admin_notifications notification
left join public.studio2_organizer_tasks task
  on task.source_key=notification.source_key
where notification.resolution_mode='domain'
  and notification.requires_action
  and notification.resolved_at is null
  and (
    task.id is null
    or task.state='resolved'
    or nullif(btrim(notification.href),'') is null
    or notification.href is distinct from task.href
  );
")"
  [[ "$contradictory_notifications" == "0" ]] || fail "$contradictory_notifications actionable Organizer notifications contradict canonical Task state/route"

  stale_deliveries="$(db_scalar "
select count(*)
from public.notification_deliveries delivery
left join public.studio2_organizer_tasks task
  on delivery.category='organizer_tasks'
 and delivery.subject_id ~* '^[0-9a-f-]{36}$'
 and task.id=delivery.subject_id::uuid
where delivery.category='organizer_tasks'
  and delivery.status in ('pending','processing')
  and (
    task.id is null
    or task.state='resolved'
    or nullif(btrim(delivery.route),'') is null
    or delivery.route is distinct from task.href
  );
")"
  [[ "$stale_deliveries" == "0" ]] || fail "$stale_deliveries pending Organizer push deliveries are stale or point at impossible actions"
  log "S14_ARCHIVE_PREFLIGHT_TASKS_NOTIFICATIONS_STABLE"

  receipts_before="$(archive_receipt_count)"
  [[ "$receipts_before" -gt 0 ]] || fail "S14 has no durable successful operation receipts before Archive"
  semi_one_public_before="$(archive_public_result_count "$SEMI_ONE_ID")"
  semi_two_public_before="$(archive_public_result_count "$SEMI_TWO_ID")"
  [[ "$semi_one_public_before" -gt 0 && "$semi_two_public_before" -gt 0 ]] || fail "published historical Results are missing before Archive"

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    result_version="$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=$result_version;")" == "1" ]] || fail "immutable historical Result version is missing for $show_id"
    [[ "$(db_scalar "select source_result_version::text from public.studio2_show_publication_controls where show_id='$show_id'::uuid and state='public';")" == "$result_version" ]] || fail "historical publication pointer drifted from immutable Result version for $show_id"
  done
  log "S14_ARCHIVE_PREFLIGHT_HISTORY_RETAINED"

  # Bounded outage injection. The dead loopback endpoint must fail transport;
  # nothing may synthesize success. Immediately afterwards, the authoritative
  # local Supabase API must still recover normally.
  dead_body="$(mktemp)"
  if curl -fsS --connect-timeout 1 --max-time 1 -o "$dead_body" \
      -H "apikey: $ANON_KEY" \
      -H "Authorization: Bearer $ANON_KEY" \
      'http://127.0.0.1:1/rest/v1/editions?select=id&limit=1'; then
    rm -f "$dead_body"
    fail "simulated Supabase outage unexpectedly returned success"
  fi
  [[ ! -s "$dead_body" ]] || fail "simulated Supabase outage produced a fake success payload"
  rm -f "$dead_body"

  request GET "$API_URL/rest/v1/editions?id=eq.$EDITION_ID&select=id,slug,status" "$ANON_KEY" "$ANON_KEY"
  expect_success "authoritative recovery after simulated Supabase outage"
  expect_json "recovered exact S14 edition" '0.id' "$EDITION_ID"
  [[ "$(archive_receipt_count)" == "$receipts_before" ]] || fail "outage simulation mutated durable operation receipts"
  [[ "$(archive_public_result_count "$SEMI_ONE_ID")" == "$semi_one_public_before" ]] || fail "outage simulation changed Semi-final 1 history"
  [[ "$(archive_public_result_count "$SEMI_TWO_ID")" == "$semi_two_public_before" ]] || fail "outage simulation changed Semi-final 2 history"
  log "S14_ARCHIVE_PREFLIGHT_OUTAGE_RECOVERY_PROVEN"

  if [[ "$archive_contract_ready" != "true" ]]; then
    log "S14_ARCHIVE_TRANSITION_BLOCKED:${archive_contract_blockers:-unknown}"
    return 0
  fi

  # Do not guess the future System-owned command shape here. When #587 lands,
  # this stage must be extended to execute and reconcile that exact command,
  # then prove archived CTAs disappear while history/receipts remain.
  fail "Archive transition contract is now ready, but Stage 10 has not yet been updated to consume the landed System command. Refusing to fall back to studio2_transition_edition_v2."
}
