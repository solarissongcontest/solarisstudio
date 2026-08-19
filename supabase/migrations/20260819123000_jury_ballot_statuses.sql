begin;

create table if not exists public.jury_ballot_statuses (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  voter_id uuid references public.voters(id) on delete cascade,
  voter_country_id uuid references public.countries(id) on delete cascade,
  voter_entity_id uuid references public.contest_entities(id) on delete cascade,
  status text not null check (status in ('did_not_vote')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jury_ballot_status_identity_chk check (
    voter_id is not null or voter_country_id is not null or voter_entity_id is not null
  )
);

create unique index if not exists jury_ballot_status_identity_key
  on public.jury_ballot_statuses (
    show_id,
    coalesce(voter_id, voter_entity_id, voter_country_id)
  );

create index if not exists jury_ballot_status_edition_idx
  on public.jury_ballot_statuses (edition_id);
create index if not exists jury_ballot_status_show_idx
  on public.jury_ballot_statuses (show_id);

alter table public.jury_ballot_statuses enable row level security;

grant select, insert, update, delete on public.jury_ballot_statuses to authenticated;
grant all on public.jury_ballot_statuses to service_role;

drop policy if exists "jury ballot statuses organizer access" on public.jury_ballot_statuses;
create policy "jury ballot statuses organizer access"
on public.jury_ballot_statuses
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'::public.app_role))
with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

create trigger jury_ballot_statuses_updated_at
before update on public.jury_ballot_statuses
for each row execute function public.update_updated_at_column();

-- The compact organizer health strip must use the same jury-completeness rule
-- as the full Organizer Overview. A did-not-vote jury is intentionally absent,
-- not an incomplete zero-point ballot. A DNV status plus saved scores is a
-- blocking conflict rather than silently choosing one interpretation.
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
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
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

revoke all on function public.admin_edition_health_summary(uuid) from public, anon;
grant execute on function public.admin_edition_health_summary(uuid) to authenticated, service_role;

commit;
