begin;

-- System V3 / Organizer O6 (#581): bridge successful governed Show lifecycle
-- operations into the canonical S4 DomainEvent ledger in the same transaction
-- as operation completion. Keep show_id NULL in the event provenance because a
-- draft Show must not become permanently undeletable merely because its own
-- create/update audit event holds an FK back to it; aggregate_id remains the
-- durable Show identity.
select public.v3_register_migration_contract(
  '20261019211200_v3_show_lifecycle_events',
  1,
  'forward_fix_only',
  false,
  null,
  'Emit show.changed facts for governed Show lifecycle operation receipts'
);

create or replace function private.studio2_emit_show_lifecycle_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_show_id uuid;
  v_edition_id uuid;
  v_state_version bigint;
  v_event_version bigint;
  v_action text;
  v_deleted boolean;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in ('show.create', 'show.update', 'show.mode.update', 'show.delete') then
    return new;
  end if;

  begin
    v_show_id := nullif(new.result ->> 'showId', '')::uuid;
    v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    v_state_version := nullif(new.result ->> 'stateVersion', '')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Completed show lifecycle operation has invalid event provenance'
      using errcode = '23514';
  end;

  v_action := case new.command
    when 'show.create' then 'create'
    when 'show.update' then 'update'
    when 'show.mode.update' then 'show_mode'
    when 'show.delete' then 'delete'
    else null
  end;
  v_deleted := new.command = 'show.delete';

  if v_show_id is null
     or v_edition_id is null
     or v_state_version is null
     or v_state_version < 1
     or v_action is null then
    raise exception 'Completed show lifecycle operation lacks canonical event provenance'
      using errcode = '23514';
  end if;

  -- Deletion is the next state after the last persisted row version. The row no
  -- longer exists to let the ordinary version trigger advance it, so represent
  -- the tombstone as the following aggregate version.
  v_event_version := v_state_version + case when v_deleted then 1 else 0 end;

  perform private.v3_emit_domain_event(
    'show.changed',
    'show',
    v_show_id::text,
    v_event_version,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_build_object(
      'showId', v_show_id,
      'editionId', v_edition_id,
      'action', v_action,
      'stateVersion', v_state_version,
      'eventVersion', v_event_version,
      'deleted', v_deleted
    ),
    1,
    array[]::text[]
  );

  return new;
end
$body$;

revoke all on function private.studio2_emit_show_lifecycle_operation_event()
  from public, anon, authenticated, service_role;

drop trigger if exists studio2_emit_show_lifecycle_operation_event
  on public.studio2_operation_receipts;
create trigger studio2_emit_show_lifecycle_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.studio2_emit_show_lifecycle_operation_event();

comment on function private.studio2_emit_show_lifecycle_operation_event() is
  'S4 bridge for completed governed Show lifecycle operations. Emits show.changed from durable S2 receipt provenance.';

commit;
