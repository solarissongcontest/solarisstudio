begin;

-- Worker 6 / System #598. Transactional command half of the canonical O6
-- membership authority. The preceding migration owns dependency-aware preview.
select public.v3_register_migration_contract(
  'v3.show-lineup-membership-execute',
  1,
  'forward_fix_only',
  false,
  null,
  'Exact-show membership mutation with CAS, replay protection, dependency revalidation, audit, receipt and show.changed evidence'
);

create or replace function public.v3_execute_show_lineup_membership_operation(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $execute$
declare
  v_show public.shows%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_risk text;
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_before_version text;
  v_after_version text;
  v_entity public.contest_entities%rowtype;
  v_participant public.participants%rowtype;
  v_prior public.participants%rowtype;
  v_dependency jsonb := '{}'::jsonb;
  v_source_ids uuid[] := array[]::uuid[];
  v_source public.participants%rowtype;
  v_source_count integer := 0;
  v_valid_source_count integer := 0;
  v_duplicate_count integer := 0;
  v_changed integer := 0;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action not in ('member_add', 'member_remove', 'promote_qualifiers') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action = 'member_remove' and v_reason is null then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_command := case v_action
    when 'member_add' then 'show.lineup.member.add'
    when 'member_remove' then 'show.lineup.member.remove'
    else 'show.lineup.qualifiers.promote'
  end;
  v_risk := case when v_action = 'member_remove' then 'R3' else 'R2' end;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    v_risk,
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
      'expectedStateVersion', p_expected_state_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id
  for update;

  if v_show.id is null or v_show.edition_id is distinct from p_edition_id
     or v_show.lineup_stage is distinct from 'lineup' then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  perform 1
  from public.participants p
  where p.show_id = p_show_id
  order by p.id
  for update;

  v_before := private.v3_show_lineup_state_payload(p_show_id);
  v_before_version := private.v3_show_lineup_state_version(p_show_id);
  if v_before_version is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_action = 'member_add' then
    if nullif(v_payload ->> 'contestEntityId', '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select * into v_entity
    from public.contest_entities e
    where e.id = (v_payload ->> 'contestEntityId')::uuid
    for update;

    if v_entity.id is null or v_entity.edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
    end if;
    if exists (
      select 1 from public.participants p
      where p.show_id = p_show_id
        and (
          p.contest_entity_id = v_entity.id
          or (v_entity.country_id is not null and p.country_id = v_entity.country_id)
        )
    ) then
      raise exception using errcode = '23505', message = 'IDENTITY_ALREADY_IN_SHOW';
    end if;

    select * into v_prior
    from public.participants p
    where p.edition_id = p_edition_id
      and p.show_id is distinct from p_show_id
      and (
        p.contest_entity_id = v_entity.id
        or (v_entity.country_id is not null and p.country_id = v_entity.country_id)
      )
    order by (p.artist is not null or p.song is not null) desc, p.updated_at desc, p.created_at desc
    limit 1;

    insert into public.participants (
      edition_id,
      show_id,
      country_id,
      contest_entity_id,
      running_order,
      running_order_allocation,
      semi_final,
      artist,
      song
    ) values (
      p_edition_id,
      p_show_id,
      v_entity.country_id,
      v_entity.id,
      null,
      null,
      v_show.kind,
      v_prior.artist,
      v_prior.song
    );
    v_changed := 1;

  elsif v_action = 'member_remove' then
    if nullif(v_payload ->> 'participantId', '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select * into v_participant
    from public.participants p
    where p.id = (v_payload ->> 'participantId')::uuid
      and p.show_id = p_show_id
    for update;

    if v_participant.id is null or v_participant.edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
    end if;

    v_dependency := private.v3_show_member_dependency_summary(
      p_show_id,
      v_participant.country_id,
      v_participant.contest_entity_id
    );
    if coalesce((v_dependency ->> 'blockingCount')::integer, 0) > 0
       or v_participant.publication_status = 'published' then
      raise exception using errcode = '23503', message = 'DEPENDENCY_BLOCKED';
    end if;

    delete from public.participants where id = v_participant.id;
    v_changed := 1;

  else
    if v_show.kind not in ('grand-final', 'final') then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
    if jsonb_typeof(coalesce(v_payload -> 'sourceParticipantIds', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select coalesce(array_agg(distinct item.value::uuid), array[]::uuid[])
    into v_source_ids
    from jsonb_array_elements_text(coalesce(v_payload -> 'sourceParticipantIds', '[]'::jsonb)) item(value);
    v_source_count := cardinality(v_source_ids);
    if v_source_count = 0 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    perform 1 from public.participants source
    where source.id = any(v_source_ids)
    order by source.id
    for update;

    select count(*)::integer
    into v_valid_source_count
    from public.participants source
    where source.id = any(v_source_ids)
      and source.edition_id = p_edition_id
      and source.show_id is distinct from p_show_id
      and source.qualified = true;
    if v_valid_source_count <> v_source_count then
      raise exception using errcode = '22023', message = 'INVALID_QUALIFIER_SOURCE';
    end if;

    select count(*)::integer
    into v_duplicate_count
    from public.participants source
    where source.id = any(v_source_ids)
      and exists (
        select 1
        from public.participants target
        where target.show_id = p_show_id
          and (
            (source.contest_entity_id is not null and target.contest_entity_id = source.contest_entity_id)
            or (source.country_id is not null and target.country_id = source.country_id)
          )
      );
    if v_duplicate_count > 0 then
      raise exception using errcode = '23505', message = 'QUALIFIER_ALREADY_IN_FINAL';
    end if;

    for v_source in
      select source.*
      from public.participants source
      where source.id = any(v_source_ids)
      order by source.id
    loop
      insert into public.participants (
        edition_id,
        show_id,
        country_id,
        contest_entity_id,
        running_order,
        running_order_allocation,
        semi_final,
        artist,
        song
      ) values (
        p_edition_id,
        p_show_id,
        v_source.country_id,
        v_source.contest_entity_id,
        null,
        null,
        v_show.kind,
        v_source.artist,
        v_source.song
      );
      v_changed := v_changed + 1;
    end loop;
  end if;

  if v_changed > 0 then
    update public.shows set updated_at = now() where id = p_show_id;
  end if;

  v_after := private.v3_show_lineup_state_payload(p_show_id);
  v_after_version := private.v3_show_lineup_state_version(p_show_id);

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    v_command,
    'shows',
    p_show_id::text,
    p_edition_id,
    v_before,
    v_after || jsonb_build_object(
      'reason', v_reason,
      'dependencies', v_dependency,
      'sourceParticipantIds', to_jsonb(v_source_ids)
    )
  );

  select coalesce(max(event.aggregate_version), 0) + 1
  into v_event_version
  from private.v3_domain_events event
  where event.event_type = 'show.changed'
    and event.aggregate_type = 'show'
    and event.aggregate_id = p_show_id::text;

  perform private.v3_emit_domain_event(
    'show.changed',
    'show',
    p_show_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    p_show_id,
    jsonb_build_object(
      'lineupAction', v_action,
      'beforeStateVersion', v_before_version,
      'afterStateVersion', v_after_version,
      'changedCount', v_changed,
      'reason', v_reason,
      'dependencies', v_dependency,
      'sourceParticipantIds', to_jsonb(v_source_ids)
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', v_action,
    'lineupStage', v_after ->> 'lineupStage',
    'stateVersion', v_after_version,
    'participantCount', jsonb_array_length(v_after -> 'participants'),
    'changedCount', v_changed,
    'dependencies', v_dependency,
    'sourceParticipantIds', to_jsonb(v_source_ids)
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$execute$;

revoke all on function public.v3_execute_show_lineup_membership_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_lineup_membership_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) to authenticated, service_role;

comment on function public.v3_execute_show_lineup_membership_operation(uuid, uuid, text, jsonb, uuid, text, text, text, uuid) is
  'O6 canonical show membership command with exact scope, CAS, S2 replay protection, dependency revalidation, provenance, audit and show.changed event evidence.';

notify pgrst, 'reload schema';

commit;
