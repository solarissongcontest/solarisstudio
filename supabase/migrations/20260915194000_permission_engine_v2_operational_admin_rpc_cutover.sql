begin;

-- Permission Engine v2 cutover batch 7.
--
-- Remove the remaining direct Organizer checks from legacy edition/show admin
-- RPCs. Keep strict Organizer + capability behavior before authoritative
-- cutover, then let the mapped Permission Engine capability become authoritative.

create or replace function public.admin_edition_health_summary(_edition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_show_count integer := 0;
  v_entry_count integer := 0;
  v_missing_songs integer := 0;
  v_missing_artists integer := 0;
  v_running_issues integer := 0;
  v_jury_issues integer := 0;
  v_televote_issues integer := 0;
  v_result_issues integer := 0;
  v_publication_issues integer := 0;
  v_issue_count integer := 0;
  v_critical_count integer := 0;
  v_failed_areas integer := 0;
  v_progress integer := 100;
  v_first_issue text := null;
  r record;
begin
  if not public.studio2_access_allowed('edition.read', _edition_id, true) then
    raise exception 'Missing Solaris capability: edition.read' using errcode = '42501';
  end if;

  select count(*) into v_show_count
  from public.shows
  where edition_id = _edition_id;

  select
    count(*),
    count(*) filter (where song is null or btrim(song) = ''),
    count(*) filter (where artist is null or btrim(artist) = '')
  into v_entry_count, v_missing_songs, v_missing_artists
  from public.participants
  where edition_id = _edition_id;

  if v_show_count = 0 then
    v_issue_count := v_issue_count + 1;
    v_critical_count := v_critical_count + 1;
    v_first_issue := coalesce(v_first_issue, 'No shows created');
  end if;

  if v_entry_count = 0 then
    v_issue_count := v_issue_count + 1;
    v_critical_count := v_critical_count + 1;
    v_first_issue := coalesce(v_first_issue, 'No entries added');
  end if;

  if v_missing_songs > 0 then
    v_issue_count := v_issue_count + 1;
    v_first_issue := coalesce(v_first_issue, v_missing_songs || ' entries have no song');
  end if;

  if v_missing_artists > 0 then
    v_issue_count := v_issue_count + 1;
    v_first_issue := coalesce(v_first_issue, v_missing_artists || ' entries have no artist');
  end if;

  for r in
    select
      s.id,
      s.name,
      s.published,
      s.voting_config,
      count(p.id) as entry_count,
      count(p.running_order) as running_count,
      count(distinct p.running_order) filter (where p.running_order is not null) as running_unique_count,
      coalesce(jsonb_array_length(coalesce(s.voting_config -> 'juryPoints', '[]'::jsonb)), 0) as jury_points_required
    from public.shows s
    left join public.participants p on p.show_id = s.id
    where s.edition_id = _edition_id
    group by s.id
    order by s.sort_order, s.name
  loop
    if r.entry_count > 0 then
      if r.running_count <> r.entry_count or r.running_unique_count <> r.running_count then
        v_running_issues := v_running_issues + 1;
        v_issue_count := v_issue_count + 1;
        if r.running_unique_count <> r.running_count then
          v_critical_count := v_critical_count + 1;
        end if;
        v_first_issue := coalesce(v_first_issue, r.name || ' running order needs attention');
      end if;

      if r.jury_points_required > 0 then
        if exists (
          select 1
          from public.voters v
          join public.jury_ballot_statuses bs
            on bs.show_id = r.id
           and bs.status = 'did_not_vote'
           and (
             bs.voter_id = v.id
             or (bs.voter_id is null and v.contest_entity_id is not null and bs.voter_entity_id = v.contest_entity_id)
             or (bs.voter_id is null and bs.voter_entity_id is null and v.country_id is not null and bs.voter_country_id = v.country_id)
           )
          where v.show_id = r.id
            and exists (
              select 1
              from public.jury_votes j
              where j.show_id = r.id
                and (
                  j.voter_id = v.id
                  or (j.voter_id is null and v.contest_entity_id is not null and j.voter_entity_id = v.contest_entity_id)
                  or (j.voter_id is null and j.voter_entity_id is null and v.country_id is not null and j.voter_country_id = v.country_id)
                )
            )
        ) then
          v_jury_issues := v_jury_issues + 1;
          v_issue_count := v_issue_count + 1;
          v_critical_count := v_critical_count + 1;
          v_first_issue := coalesce(v_first_issue, r.name || ' has a jury did-not-vote conflict');
        end if;

        if exists (
          select 1
          from public.voters v
          where v.show_id = r.id
            and not exists (
              select 1
              from public.jury_ballot_statuses bs
              where bs.show_id = r.id
                and bs.status = 'did_not_vote'
                and (
                  bs.voter_id = v.id
                  or (bs.voter_id is null and v.contest_entity_id is not null and bs.voter_entity_id = v.contest_entity_id)
                  or (bs.voter_id is null and bs.voter_entity_id is null and v.country_id is not null and bs.voter_country_id = v.country_id)
                )
            )
            and (
              select count(*)
              from public.jury_votes j
              where j.show_id = r.id
                and (
                  j.voter_id = v.id
                  or (j.voter_id is null and v.contest_entity_id is not null and j.voter_entity_id = v.contest_entity_id)
                  or (j.voter_id is null and j.voter_entity_id is null and v.country_id is not null and j.voter_country_id = v.country_id)
                )
            ) < r.jury_points_required
        ) then
          v_jury_issues := v_jury_issues + 1;
          v_issue_count := v_issue_count + 1;
          v_first_issue := coalesce(v_first_issue, r.name || ' has incomplete jury ballots');
        end if;
      end if;

      if not exists (select 1 from public.televote_votes t where t.show_id = r.id)
         and (
           exists (select 1 from public.jury_votes j where j.show_id = r.id)
           or exists (select 1 from public.results rr where rr.show_id = r.id)
         ) then
        v_televote_issues := v_televote_issues + 1;
        v_issue_count := v_issue_count + 1;
        v_first_issue := coalesce(v_first_issue, r.name || ' has no televote data');
      end if;

      if exists (
        select 1 from public.results rr
        where rr.show_id = r.id
          and rr.total_points <> rr.jury_points + rr.televote_points
      ) then
        v_result_issues := v_result_issues + 1;
        v_issue_count := v_issue_count + 1;
        v_critical_count := v_critical_count + 1;
        v_first_issue := coalesce(v_first_issue, r.name || ' result totals do not reconcile');
      end if;

      if exists (
        select 1 from public.results rr
        where rr.show_id = r.id and rr.final_rank is null
      ) then
        v_result_issues := v_result_issues + 1;
        v_issue_count := v_issue_count + 1;
        v_critical_count := v_critical_count + 1;
        v_first_issue := coalesce(v_first_issue, r.name || ' has incomplete final ranks');
      end if;

      if exists (select 1 from public.results rr where rr.show_id = r.id)
         and (select count(*) from public.results rr where rr.show_id = r.id) <> r.entry_count then
        v_result_issues := v_result_issues + 1;
        v_issue_count := v_issue_count + 1;
        v_critical_count := v_critical_count + 1;
        v_first_issue := coalesce(v_first_issue, r.name || ' results do not match participant count');
      end if;
    elsif r.published then
      v_issue_count := v_issue_count + 1;
      v_first_issue := coalesce(v_first_issue, r.name || ' is public but has no participants');
    end if;
  end loop;

  if v_show_count = 0 then v_failed_areas := v_failed_areas + 1; end if;
  if v_entry_count = 0 or v_missing_songs > 0 or v_missing_artists > 0 or v_running_issues > 0 then
    v_failed_areas := v_failed_areas + 1;
  end if;
  if v_jury_issues > 0 then v_failed_areas := v_failed_areas + 1; end if;
  if v_televote_issues > 0 then v_failed_areas := v_failed_areas + 1; end if;
  if v_result_issues > 0 then v_failed_areas := v_failed_areas + 1; end if;
  if v_publication_issues > 0 then v_failed_areas := v_failed_areas + 1; end if;

  v_progress := round(((6 - least(v_failed_areas, 6))::numeric / 6::numeric) * 100)::integer;

  return jsonb_build_object(
    'status', case
      when v_critical_count > 0 then 'blocked'
      when v_issue_count > 0 then 'needs-attention'
      else 'ready'
    end,
    'progress', v_progress,
    'issues_count', v_issue_count,
    'critical_count', v_critical_count,
    'first_issue', v_first_issue,
    'show_count', v_show_count,
    'entry_count', v_entry_count,
    'missing_songs', v_missing_songs,
    'missing_artists', v_missing_artists,
    'running_issues', v_running_issues,
    'jury_issues', v_jury_issues,
    'televote_issues', v_televote_issues,
    'result_issues', v_result_issues
  );
end;
$$;

create or replace function public.admin_recalculate_show_results(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edition_id uuid;
begin
  select s.edition_id into v_edition_id
  from public.shows s
  where s.id = _show_id;

  if not public.studio2_access_allowed('results.verify', v_edition_id, true) then
    raise exception 'Missing Solaris capability: results.verify' using errcode = '42501';
  end if;

  return public.recalculate_show_results_internal(_show_id);
end;
$$;

create or replace function public.admin_set_jury_voting_status(
  _show_id uuid,
  _status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_show public.shows;
  participant_count integer;
  point_count integer;
  jury_enabled boolean;
  allow_self boolean;
  participating_roster_count integer;
begin
  select * into target_show
  from public.shows
  where id = _show_id;

  if not public.studio2_access_allowed('voting.manage', target_show.edition_id, true) then
    raise exception 'Missing Solaris capability: voting.manage' using errcode = '42501';
  end if;

  if _status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status';
  end if;

  if target_show is null then
    raise exception 'Show not found';
  end if;

  jury_enabled := coalesce((target_show.voting_config ->> 'juryEnabled')::boolean, true);
  allow_self := coalesce((target_show.voting_config ->> 'allowSelfVote')::boolean, false);
  point_count := jsonb_array_length(
    coalesce(target_show.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb)
  );

  if _status = 'open' and not jury_enabled then
    raise exception 'Jury voting is disabled for this show';
  end if;

  if _status = 'open' then
    select count(*) into participant_count
    from public.participants p
    where p.show_id = _show_id
      and (p.participation_status is null or p.participation_status = 'confirmed');

    if participant_count < point_count then
      raise exception 'This show does not have enough entries for the configured jury point scale';
    end if;

    if not allow_self and participant_count = point_count then
      if not exists (select 1 from public.voters where show_id = _show_id) then
        raise exception 'Add one more entry or shorten the jury point scale because participating juries cannot vote for themselves';
      end if;

      select count(*) into participating_roster_count
      from public.voters v
      where v.show_id = _show_id
        and exists (
          select 1 from public.participants p
          where p.show_id = _show_id
            and p.country_id = v.country_id
            and (p.participation_status is null or p.participation_status = 'confirmed')
        );

      if participating_roster_count > 0 then
        raise exception 'The configured jury scale leaves participating juries too few eligible entries after self-voting is blocked';
      end if;
    end if;

    update public.jury_voting_windows
      set status = 'closed', closed_at = now(), updated_at = now()
    where edition_id = target_show.edition_id
      and show_id <> _show_id
      and status = 'open';
  end if;

  insert into public.jury_voting_windows (
    show_id, edition_id, status, opened_at, closed_at, opened_by, updated_at
  ) values (
    _show_id,
    target_show.edition_id,
    _status,
    case when _status = 'open' then now() else null end,
    case when _status = 'closed' then now() else null end,
    case when _status = 'open' then auth.uid() else null end,
    now()
  )
  on conflict (show_id) do update set
    edition_id = excluded.edition_id,
    status = excluded.status,
    opened_at = case when excluded.status = 'open' then now() else jury_voting_windows.opened_at end,
    closed_at = case when excluded.status = 'closed' then now() else null end,
    opened_by = case when excluded.status = 'open' then auth.uid() else jury_voting_windows.opened_by end,
    updated_at = now();

  return jsonb_build_object('ok', true, 'show_id', _show_id, 'status', _status);
end;
$$;

create or replace function public.admin_set_participation_status(
  _edition_id uuid,
  _country_id uuid default null,
  _contest_entity_id uuid default null,
  _status text default 'confirmed'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  if not public.studio2_access_allowed('entry.approve', _edition_id, true) then
    raise exception 'Missing Solaris capability: entry.approve' using errcode = '42501';
  end if;

  if _edition_id is null then
    raise exception 'Edition is required';
  end if;

  if _status not in ('confirmed', 'withdrawn', 'disqualified') then
    raise exception 'Invalid participation status';
  end if;

  if _country_id is null and _contest_entity_id is null then
    raise exception 'Country or contest entity is required';
  end if;

  update public.participants p
  set participation_status = _status,
      updated_at = now()
  where p.edition_id = _edition_id
    and (
      (_country_id is not null and p.country_id = _country_id)
      or (
        _country_id is null
        and _contest_entity_id is not null
        and p.country_id is null
        and p.contest_entity_id = _contest_entity_id
      )
    );

  get diagnostics v_updated = row_count;

  if _country_id is not null then
    update public.entries
    set status = _status,
        updated_at = now()
    where edition_id = _edition_id
      and country_id = _country_id;
  end if;

  return v_updated;
end;
$$;

create or replace function public.admin_set_show_running_order(
  _show_id uuid,
  _participant_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edition_id uuid;
  v_expected integer;
  v_supplied integer;
  v_distinct integer;
  v_id uuid;
  v_position integer := 0;
begin
  select s.edition_id into v_edition_id
  from public.shows s
  where s.id = _show_id;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_expected
  from public.participants p
  where p.show_id = _show_id;

  v_supplied := coalesce(array_length(_participant_ids, 1), 0);
  select count(distinct x)::integer
    into v_distinct
  from unnest(coalesce(_participant_ids, '{}'::uuid[])) as x;

  if v_supplied <> v_expected or v_distinct <> v_expected then
    raise exception 'Running order must contain every show participant exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(_participant_ids, '{}'::uuid[])) as supplied(id)
    left join public.participants p
      on p.id = supplied.id
     and p.show_id = _show_id
    where p.id is null
  ) then
    raise exception 'Running order contains a participant from another show.' using errcode = '22023';
  end if;

  update public.participants
     set running_order = null
   where show_id = _show_id;

  foreach v_id in array coalesce(_participant_ids, '{}'::uuid[]) loop
    v_position := v_position + 1;
    update public.participants
       set running_order = v_position,
           updated_at = now()
     where id = v_id
       and show_id = _show_id;
  end loop;
end;
$$;

revoke all on function public.admin_edition_health_summary(uuid) from public, anon;
grant execute on function public.admin_edition_health_summary(uuid) to authenticated, service_role;

revoke all on function public.admin_recalculate_show_results(uuid) from public, anon;
grant execute on function public.admin_recalculate_show_results(uuid) to authenticated, service_role;

revoke all on function public.admin_set_jury_voting_status(uuid, text) from public, anon;
grant execute on function public.admin_set_jury_voting_status(uuid, text) to authenticated, service_role;

revoke all on function public.admin_set_participation_status(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_participation_status(uuid, uuid, uuid, text) to authenticated, service_role;

revoke all on function public.admin_set_show_running_order(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_show_running_order(uuid, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
