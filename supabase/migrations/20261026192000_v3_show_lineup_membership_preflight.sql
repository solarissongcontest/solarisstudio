begin;

-- Worker 6 / System #598. This is the preflight half of the canonical O6
-- membership authority, split from the historical draft so we can restore the
-- System contract without importing its stale Organizer workspace rewrite.
select public.v3_register_migration_contract(
  'v3.show-lineup-membership-preflight',
  1,
  'forward_fix_only',
  false,
  null,
  'Dependency-aware exact-show membership preflight for add, remove and qualifier promotion'
);

create or replace function private.v3_show_member_dependency_summary(
  p_show_id uuid,
  p_country_id uuid,
  p_contest_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $deps$
declare
  v_results integer := 0;
  v_jury_votes integer := 0;
  v_televote_votes integer := 0;
  v_voters integer := 0;
  v_jury_submissions integer := 0;
  v_jury_statuses integer := 0;
begin
  select count(*)::integer into v_results
  from public.results r
  where r.show_id = p_show_id
    and (
      (p_contest_entity_id is not null and r.contest_entity_id = p_contest_entity_id)
      or (p_country_id is not null and r.country_id = p_country_id)
    );

  select count(*)::integer into v_jury_votes
  from public.jury_votes v
  where v.show_id = p_show_id
    and (
      (p_contest_entity_id is not null and (v.receiving_entity_id = p_contest_entity_id or v.voter_entity_id = p_contest_entity_id))
      or (p_country_id is not null and (v.receiving_country_id = p_country_id or v.voter_country_id = p_country_id))
    );

  select count(*)::integer into v_televote_votes
  from public.televote_votes v
  where v.show_id = p_show_id
    and (
      (p_contest_entity_id is not null and v.contest_entity_id = p_contest_entity_id)
      or (p_country_id is not null and v.country_id = p_country_id)
    );

  select count(*)::integer into v_voters
  from public.voters v
  where v.show_id = p_show_id
    and (
      (p_contest_entity_id is not null and v.contest_entity_id = p_contest_entity_id)
      or (p_country_id is not null and v.country_id = p_country_id)
    );

  select count(*)::integer into v_jury_submissions
  from public.jury_ballot_submissions s
  where s.show_id = p_show_id
    and (
      (p_contest_entity_id is not null and s.voter_entity_id = p_contest_entity_id)
      or (p_country_id is not null and s.voter_country_id = p_country_id)
    );

  select count(*)::integer into v_jury_statuses
  from public.jury_ballot_statuses s
  where s.show_id = p_show_id
    and (
      (p_contest_entity_id is not null and s.voter_entity_id = p_contest_entity_id)
      or (p_country_id is not null and s.voter_country_id = p_country_id)
    );

  return jsonb_build_object(
    'results', v_results,
    'juryVotes', v_jury_votes,
    'televoteVotes', v_televote_votes,
    'voters', v_voters,
    'jurySubmissions', v_jury_submissions,
    'juryStatuses', v_jury_statuses,
    'blockingCount', v_results + v_jury_votes + v_televote_votes + v_voters + v_jury_submissions + v_jury_statuses
  );
end
$deps$;

revoke all on function private.v3_show_member_dependency_summary(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.v3_show_lineup_membership_preflight(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_show public.shows%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_state_version text;
  v_blockers text[] := array[]::text[];
  v_entity public.contest_entities%rowtype;
  v_participant public.participants%rowtype;
  v_dependency jsonb := '{}'::jsonb;
  v_source_ids uuid[] := array[]::uuid[];
  v_source_count integer := 0;
  v_valid_source_count integer := 0;
  v_duplicate_count integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action not in ('member_add', 'member_remove', 'promote_qualifiers') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_state_version := private.v3_show_lineup_state_version(p_show_id);
  if v_show.lineup_stage is distinct from 'lineup' then
    v_blockers := array_append(v_blockers, 'membership_locked_after_allocation_started');
  end if;

  if v_action = 'member_add' then
    if nullif(v_payload ->> 'contestEntityId', '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select * into v_entity
    from public.contest_entities e
    where e.id = (v_payload ->> 'contestEntityId')::uuid;

    if v_entity.id is null or v_entity.edition_id is distinct from p_edition_id then
      v_blockers := array_append(v_blockers, 'contest_entity_scope_mismatch');
    elsif exists (
      select 1 from public.participants p
      where p.show_id = p_show_id
        and (
          p.contest_entity_id = v_entity.id
          or (v_entity.country_id is not null and p.country_id = v_entity.country_id)
        )
    ) then
      v_blockers := array_append(v_blockers, 'identity_already_in_show');
    end if;

  elsif v_action = 'member_remove' then
    if nullif(v_payload ->> 'participantId', '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select * into v_participant
    from public.participants p
    where p.id = (v_payload ->> 'participantId')::uuid
      and p.show_id = p_show_id;

    if v_participant.id is null or v_participant.edition_id is distinct from p_edition_id then
      v_blockers := array_append(v_blockers, 'participant_scope_mismatch');
    else
      v_dependency := private.v3_show_member_dependency_summary(
        p_show_id,
        v_participant.country_id,
        v_participant.contest_entity_id
      );
      if coalesce((v_dependency ->> 'blockingCount')::integer, 0) > 0 then
        v_blockers := array_append(v_blockers, 'official_show_dependencies_exist');
      end if;
      if v_participant.publication_status = 'published' then
        v_blockers := array_append(v_blockers, 'published_entry_membership');
      end if;
    end if;

  else
    if v_show.kind not in ('grand-final', 'final') then
      v_blockers := array_append(v_blockers, 'target_show_is_not_final');
    end if;
    if jsonb_typeof(coalesce(v_payload -> 'sourceParticipantIds', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select coalesce(array_agg(distinct item.value::uuid), array[]::uuid[])
    into v_source_ids
    from jsonb_array_elements_text(coalesce(v_payload -> 'sourceParticipantIds', '[]'::jsonb)) item(value);
    v_source_count := cardinality(v_source_ids);
    if v_source_count = 0 then
      v_blockers := array_append(v_blockers, 'no_qualifiers_selected');
    else
      select count(*)::integer
      into v_valid_source_count
      from public.participants source
      where source.id = any(v_source_ids)
        and source.edition_id = p_edition_id
        and source.show_id is distinct from p_show_id
        and source.qualified = true;

      if v_valid_source_count <> v_source_count then
        v_blockers := array_append(v_blockers, 'invalid_qualifier_source');
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
        v_blockers := array_append(v_blockers, 'qualifier_already_in_final');
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_blockers) = 0,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', v_action,
    'lineupStage', v_show.lineup_stage,
    'stateVersion', v_state_version,
    'blockers', to_jsonb(v_blockers),
    'dependencies', v_dependency,
    'sourceCount', v_source_count,
    'consequences', case v_action
      when 'member_add' then jsonb_build_array('add_identity_to_show_lineup', 'retain_unordered_state')
      when 'member_remove' then jsonb_build_array('remove_show_membership_only', 'retain_contest_identity_and_history')
      else jsonb_build_array('copy_qualified_show_membership_to_final', 'record_source_participant_provenance')
    end,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.v3_show_lineup_membership_preflight(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.v3_show_lineup_membership_preflight(uuid, uuid, text, jsonb)
  to authenticated, service_role;

comment on function public.v3_show_lineup_membership_preflight(uuid, uuid, text, jsonb) is
  'O6 dependency-aware preflight for show membership add/remove and qualifier promotion. Removal never deletes durable contest identity.';

notify pgrst, 'reload schema';

commit;
