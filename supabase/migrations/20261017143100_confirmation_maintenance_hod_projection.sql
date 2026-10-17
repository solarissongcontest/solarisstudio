begin;

create or replace function public.public_country_account_confirmation_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_country public.countries;
  v_edition public.editions;
  v_requirement public.studio2_confirmation_requirements;
  v_response public.submissions;
  v_round public.submission_rounds;
  v_response_json jsonb;
  v_entry jsonb;
  v_national_final jsonb;
  v_entry_state text := 'not_submitted';
  v_entry_feedback text;
  v_artist text;
  v_song_title text;
  v_editing_open boolean := false;
  v_editing_reason text := 'no_response';
  v_participation_state text := 'not_required';
  v_confirmation_state text := 'not_required';
begin
  if v_user is null then
    return jsonb_build_object('authenticated', false, 'country', null, 'edition', null, 'requirement', null, 'response', null);
  end if;

  select c.* into v_country
  from public.country_accounts account
  join public.countries c on c.id = account.country_id
  where account.user_id = v_user and account.status = 'active'
  limit 1;

  if v_country.id is null then
    return jsonb_build_object('authenticated', false, 'country', null, 'edition', null, 'requirement', null, 'response', null);
  end if;

  select edition.* into v_edition
  from public.editions edition
  join (
    select candidate.edition_id, max(candidate.priority) as priority
    from (
      select requirement.edition_id, 2 as priority
      from public.studio2_confirmation_requirements requirement
      where requirement.country_id = v_country.id and requirement.superseded_at is null
      union all
      select response.edition_id, 1 as priority
      from public.submissions response
      where lower(btrim(response.country)) in (lower(btrim(v_country.name)), lower(btrim(v_country.short_code)))
    ) candidate
    group by candidate.edition_id
  ) relevant on relevant.edition_id = edition.id
  order by edition.edition_number desc nulls last, relevant.priority desc, edition.created_at desc
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object(
      'authenticated', true,
      'country', jsonb_build_object('country_id', v_country.id, 'name', v_country.name, 'short_code', v_country.short_code, 'flag_image', v_country.flag_image),
      'edition', null, 'requirement', null, 'response', null,
      'participation_state', 'not_required', 'confirmation_state', 'not_required',
      'entry_state', 'not_submitted', 'editing_open', false, 'editing_reason', 'no_response'
    );
  end if;

  select requirement.* into v_requirement
  from public.studio2_confirmation_requirements requirement
  where requirement.country_id = v_country.id and requirement.edition_id = v_edition.id and requirement.superseded_at is null
  order by requirement.generation desc, requirement.created_at desc
  limit 1;

  select response.* into v_response
  from public.submissions response
  where response.edition_id = v_edition.id
    and lower(btrim(response.country)) in (lower(btrim(v_country.name)), lower(btrim(v_country.short_code)))
  order by response.submitted_at desc nulls last, response.updated_at desc, response.id
  limit 1;

  if v_response.id is not null then
    select round.* into v_round from public.submission_rounds round where round.id = v_response.round_id;

    select jsonb_build_object(
      'id', entry.id, 'artist', entry.artist, 'song_title', entry.song_title,
      'review_status', coalesce(entry.review_status, 'pending'),
      'review_reason', entry.review_reason, 'reviewed_at', entry.reviewed_at
    ) into v_entry
    from public.internal_entries entry
    where entry.submission_id = v_response.id
    limit 1;

    select jsonb_build_object(
      'id', final.id, 'nf_name', final.nf_name, 'winning_entry_id', final.winning_entry_id,
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', candidate.id, 'artist', candidate.artist, 'song_title', candidate.song_title,
          'position', candidate.position, 'review_status', coalesce(candidate.review_status, 'pending'),
          'review_reason', candidate.review_reason, 'reviewed_at', candidate.reviewed_at,
          'removed', coalesce(candidate.removed, false)
        ) order by candidate.position, candidate.id)
        from public.national_final_entries candidate
        where candidate.national_final_id = final.id
      ), '[]'::jsonb)
    ) into v_national_final
    from public.national_finals final
    where final.submission_id = v_response.id
    limit 1;

    v_editing_open := not coalesce(v_response.locked, false)
      and coalesce(v_response.editing_allowed, false)
      and coalesce(v_round.editing_enabled, false)
      and coalesce(v_edition.editing_enabled, false);

    v_editing_reason := case
      when coalesce(v_response.locked, false) then 'locked'
      when not coalesce(v_response.editing_allowed, false) then 'response_editing_closed'
      when not coalesce(v_round.editing_enabled, false) then 'round_editing_closed'
      when not coalesce(v_edition.editing_enabled, false) then 'edition_editing_closed'
      else 'open'
    end;

    if v_response.selection_method = 'internal' then
      v_artist := v_entry ->> 'artist';
      v_song_title := v_entry ->> 'song_title';
      v_entry_feedback := nullif(v_entry ->> 'review_reason', '');
      v_entry_state := case coalesce(v_entry ->> 'review_status', 'pending')
        when 'accepted' then 'accepted'
        when 'declined' then 'changes_requested'
        when 'removed' then 'changes_requested'
        when 'pending' then 'awaiting_review'
        else 'awaiting_review'
      end;
      if coalesce(v_response.entry_unknown, false) or v_entry is null then v_entry_state := 'not_submitted'; end if;
    elsif v_response.selection_method = 'national_final' then
      select candidate ->> 'artist', candidate ->> 'song_title'
      into v_artist, v_song_title
      from jsonb_array_elements(coalesce(v_national_final -> 'entries', '[]'::jsonb)) candidate
      where candidate ->> 'id' = v_national_final ->> 'winning_entry_id'
      limit 1;

      if exists (
        select 1 from jsonb_array_elements(coalesce(v_national_final -> 'entries', '[]'::jsonb)) candidate
        where coalesce((candidate ->> 'removed')::boolean, false) = false
          and coalesce(candidate ->> 'review_status', 'pending') in ('declined', 'removed')
      ) then
        v_entry_state := 'changes_requested';
        select nullif(candidate ->> 'review_reason', '') into v_entry_feedback
        from jsonb_array_elements(coalesce(v_national_final -> 'entries', '[]'::jsonb)) candidate
        where coalesce((candidate ->> 'removed')::boolean, false) = false
          and coalesce(candidate ->> 'review_status', 'pending') in ('declined', 'removed')
          and nullif(candidate ->> 'review_reason', '') is not null
        limit 1;
      elsif exists (
        select 1 from jsonb_array_elements(coalesce(v_national_final -> 'entries', '[]'::jsonb)) candidate
        where coalesce((candidate ->> 'removed')::boolean, false) = false
          and coalesce(candidate ->> 'review_status', 'pending') = 'pending'
      ) then
        v_entry_state := 'awaiting_review';
      elsif v_national_final is not null then
        v_entry_state := 'accepted';
      end if;
    end if;

    v_response_json := jsonb_build_object(
      'round', jsonb_build_object('id', v_round.id, 'name', v_round.name, 'status', v_round.status, 'editing_enabled', coalesce(v_round.editing_enabled, false)),
      'participating', v_response.participating, 'submitted_at', v_response.submitted_at,
      'updated_at', v_response.updated_at, 'selection_method', v_response.selection_method,
      'internal_entry', v_entry, 'national_final', v_national_final
    );
  end if;

  v_confirmation_state := case
    when v_requirement.id is null and v_response.id is null then 'not_required'
    when v_requirement.status = 'required' then 'required'
    when v_requirement.status = 'satisfied' then 'accepted'
    when v_requirement.status = 'waived' then 'waived'
    when v_requirement.status is not null then v_requirement.status
    when v_response.id is not null then 'existing_response'
    else 'not_required'
  end;

  v_participation_state := case
    when v_requirement.status = 'required' then 'action_required'
    when v_response.id is null then 'not_required'
    when coalesce(v_response.participating, false) = false then 'not_participating'
    when v_requirement.status = 'satisfied' then 'confirmed'
    else 'submitted'
  end;

  return jsonb_build_object(
    'authenticated', true,
    'country', jsonb_build_object('country_id', v_country.id, 'name', v_country.name, 'short_code', v_country.short_code, 'flag_image', v_country.flag_image),
    'edition', jsonb_build_object('id', v_edition.id, 'name', v_edition.name, 'edition_number', v_edition.edition_number, 'status', v_edition.status),
    'requirement', case when v_requirement.id is null then null else jsonb_build_object('generation', v_requirement.generation, 'status', v_requirement.status, 'reason', v_requirement.reason, 'resolved_at', v_requirement.resolved_at) end,
    'response', v_response_json,
    'participation_state', v_participation_state,
    'confirmation_state', v_confirmation_state,
    'entry_state', v_entry_state,
    'entry_feedback', v_entry_feedback,
    'artist', v_artist,
    'song_title', v_song_title,
    'editing_open', v_editing_open,
    'editing_reason', v_editing_reason,
    'last_update', coalesce(v_response.updated_at, v_response.submitted_at, v_requirement.resolved_at, v_requirement.created_at)
  );
end;
$$;

revoke all on function public.public_country_account_confirmation_dashboard() from public, anon;
grant execute on function public.public_country_account_confirmation_dashboard() to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
