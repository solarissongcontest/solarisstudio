#!/usr/bin/env bash
set -euo pipefail

run_s14_stage_5_running_orders() {
  log "Stage 5/10: running-order allocation, atomic reorder, publication and public verification"

  CURRENT_STAGE="stage-5-running-orders:sign-in"
  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # The reorder RPC must remain one set-based participant UPDATE, and
  # running-order result reconciliation must remain statement-level. A row-level
  # running_order trigger combined with a per-participant RPC loop previously
  # amplified one 33-entry reorder into 66 full show-result rebuilds.
  CURRENT_STAGE="stage-5-running-orders:batch-sync-contract"
  [[ "$(db_scalar "
select (pg_get_triggerdef(t.oid) ilike '%FOR EACH STATEMENT%')::text
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname='participants'
  and t.tgname='participants_sync_running_order_results'
  and not t.tgisinternal;
")" == "true" ]] || fail "running-order result sync is not statement-level"
  [[ "$(db_scalar "
select (pg_get_triggerdef(t.oid) not ilike '%running_order%')::text
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname='participants'
  and t.tgname='participants_sync_results'
  and not t.tgisinternal;
")" == "true" ]] || fail "row-level participant result sync still owns running_order updates"
  [[ "$(db_scalar "
select (
  position('foreach' in lower(pg_get_functiondef('public.admin_set_show_running_order(uuid,uuid[])'::regprocedure))) = 0
  and position('set running_order = null' in lower(pg_get_functiondef('public.admin_set_show_running_order(uuid,uuid[])'::regprocedure))) = 0
  and position('with ordinality' in lower(pg_get_functiondef('public.admin_set_show_running_order(uuid,uuid[])'::regprocedure))) > 0
)::text;
")" == "true" ]] || fail "admin_set_show_running_order is not using the bounded set-based reorder contract"

  # Exercise the same lifecycle the Organizer workspace owns: allocation work
  # is local until one atomic RPC, then the running order is persisted in one
  # atomic RPC. Stage transitions are still a low-risk direct show mutation in
  # the current product, so the rehearsal mirrors that existing authority
  # rather than inventing a QA-only command.
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    CURRENT_STAGE="stage-5-running-orders:reset:$show_id"
    db_exec "
update public.participants
set running_order=null, running_order_allocation=null, updated_at=now()
where show_id='$show_id'::uuid;
update public.shows
set lineup_stage='allocation', updated_at=now()
where id='$show_id'::uuid;
"

    CURRENT_STAGE="stage-5-running-orders:allocation:$show_id"
    allocation_json="$(db_scalar "
with ordered as (
  select id, row_number() over (order by country_id, id) as rn
  from public.participants
  where show_id='$show_id'::uuid
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id', id,
  'allocation', case
    when rn % 3 = 0 then 'producer_choice'
    when rn % 2 = 0 then 'second_half'
    else 'first_half'
  end
) order by rn), '[]'::jsonb)::text
from ordered;
")"
    [[ "$allocation_json" != "[]" ]] || fail "Running-order stage found an empty show allocation"

    rpc_request "$ORGANIZER_A_TOKEN" admin_set_show_allocations "{\"_show_id\":\"$show_id\",\"_allocations\":$allocation_json}"
    expect_success "atomic show allocation $show_id"

    CURRENT_STAGE="stage-5-running-orders:running-order:$show_id"
    order_json="$(db_scalar "
select coalesce(jsonb_agg(id order by country_id desc, id desc), '[]'::jsonb)::text
from public.participants
where show_id='$show_id'::uuid;
")"
    rpc_request "$ORGANIZER_A_TOKEN" admin_set_show_running_order "{\"_show_id\":\"$show_id\",\"_participant_ids\":$order_json}"
    expect_success "atomic running order $show_id"

    db_exec "update public.shows set lineup_stage='running_order', updated_at=now() where id='$show_id'::uuid;"

    CURRENT_STAGE="stage-5-running-orders:invariants:$show_id"
    show_count="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid;")"
    ordered_count="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid and running_order is not null;")"
    distinct_count="$(db_scalar "select count(distinct running_order) from public.participants where show_id='$show_id'::uuid;")"
    max_order="$(db_scalar "select coalesce(max(running_order),0) from public.participants where show_id='$show_id'::uuid;")"
    allocation_count="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid and running_order_allocation is not null;")"
    [[ "$show_count" -gt 0 ]] || fail "show $show_id has no participants"
    [[ "$ordered_count" == "$show_count" && "$distinct_count" == "$show_count" && "$max_order" == "$show_count" ]] || fail "show $show_id running order is not a unique contiguous 1..N sequence"
    [[ "$allocation_count" == "$show_count" ]] || fail "show $show_id has incomplete allocation evidence"
  done

  # Publish both semi-final running orders with the governed, versioned and
  # idempotent publication command. The operation must update the canonical
  # public show projection and emit the event-backed publication consequence.
  publication_config='{"participants":true,"artists":true,"songs":true,"semi_split":false,"running_order":true,"qualifiers":false,"results":false,"jury_results":false,"televote_results":false,"detailed_voting":false}'
  publication_index=0
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    publication_index=$((publication_index + 1))
    CURRENT_STAGE="stage-5-running-orders:publication:$show_id"
    show_count="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid;")"
    [[ "$show_count" -gt 0 ]] || fail "show $show_id has no participants at publication time"
    expected_version="$(db_scalar "select version from public.studio2_show_publication_controls where show_id='$show_id'::uuid;")"
    [[ -n "$expected_version" ]] || fail "show $show_id has no publication control version"
    suffix="$(printf '%012d' "$publication_index")"
    operation_id="14000000-0000-4005-8000-$suffix"
    idempotency_key="s14-running-order-publish-$publication_index"

    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"public\",\"p_config\":$publication_config,\"p_scheduled_for\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$expected_version}"
    expect_success "publish running order $show_id"
    expect_json "publication state $show_id" state public

    CURRENT_STAGE="stage-5-running-orders:publication-evidence:$show_id"
    [[ "$(db_scalar "select published::text from public.shows where id='$show_id'::uuid;")" == "true" ]] || fail "show $show_id was not made public"
    [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='publication.changed' and aggregate_id='$show_id';")" == "1" ]] || fail "show $show_id publication.changed event missing"
    [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='publication.show.change' and status='succeeded';")" == "1" ]] || fail "show $show_id publication operation receipt missing"

    # Verify from the anonymous Data API boundary, not merely via privileged SQL.
    CURRENT_STAGE="stage-5-running-orders:anonymous-show:$show_id"
    request GET "$API_URL/rest/v1/shows?id=eq.$show_id&select=id,published,publication_config" "$ANON_KEY" "$ANON_KEY"
    expect_success "anonymous public show lookup $show_id"
    [[ "$(printf '%s' "$HTTP_BODY" | json_value '0.id')" == "$show_id" ]] || fail "anonymous public lookup did not expose show $show_id"
    [[ "$(printf '%s' "$HTTP_BODY" | json_value '0.published')" == "true" ]] || fail "anonymous show $show_id is not public"
    [[ "$(printf '%s' "$HTTP_BODY" | json_value '0.publication_config.running_order')" == "true" ]] || fail "anonymous show $show_id does not expose running-order publication"

    CURRENT_STAGE="stage-5-running-orders:anonymous-participants:$show_id"
    request GET "$API_URL/rest/v1/participants?show_id=eq.$show_id&select=id,running_order&order=running_order.asc" "$ANON_KEY" "$ANON_KEY"
    expect_success "anonymous running-order lookup $show_id"
    public_count="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<< "$HTTP_BODY")"
    [[ "$public_count" == "$show_count" ]] || fail "anonymous running order for $show_id returned $public_count of $show_count participants"
    first_public_order="$(printf '%s' "$HTTP_BODY" | json_value '0.running_order')"
    last_public_order="$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print(rows[-1]["running_order"] if rows else "")' <<< "$HTTP_BODY")"
    [[ "$first_public_order" == "1" && "$last_public_order" == "$show_count" ]] || fail "anonymous running order for $show_id is not a contiguous published sequence"
  done

  CURRENT_STAGE="stage-5-running-orders:final-invariant"
  [[ "$(db_scalar "select count(*) from public.shows where id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and lineup_stage='running_order' and published;")" == "2" ]] || fail "both semi-final running orders were not published"
  CURRENT_STAGE="stage-5-running-orders"
  log "S14_STAGE_5_RUNNING_ORDERS_COMPLETE"
}
