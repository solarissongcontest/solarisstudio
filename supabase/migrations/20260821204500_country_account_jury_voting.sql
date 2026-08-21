-- Country-account jury voting with organizer-controlled windows and shared integrity preflight support.

alter table televoting.vote_preflight_checks
  alter column round_id drop not null;

alter table televoting.vote_preflight_checks
  add column if not exists channel text not null default 'televote',
  add column if not exists canonical_edition_id uuid references public.editions(id) on delete set null,
  add column if not exists show_id uuid references public.shows(id) on delete set null,
  add column if not exists account_user_id uuid,
  add column if not exists jury_ballot_submission_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'televoting.vote_preflight_checks'::regclass
      and conname = 'vote_preflight_checks_channel_check'
  ) then
    alter table televoting.vote_preflight_checks
      add constraint vote_preflight_checks_channel_check
      check (channel in ('televote', 'jury'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'televoting.vote_preflight_checks'::regclass
      and conname = 'vote_preflight_checks_context_check'
  ) then
    alter table televoting.vote_preflight_checks
      add constraint vote_preflight_checks_context_check
      check (
        (channel = 'televote' and round_id is not null)
        or
        (channel = 'jury' and show_id is not null and canonical_edition_id is not null and account_user_id is not null)
      );
  end if;
end $$;

create table if not exists public.jury_voting_windows (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  status text not null default 'closed' check (status in ('open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  opened_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists jury_voting_windows_edition_idx
  on public.jury_voting_windows (edition_id, status);

create table if not exists public.jury_ballot_submissions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null,
  voter_country_id uuid not null references public.countries(id) on delete restrict,
  voter_entity_id uuid references public.contest_entities(id) on delete set null,
  voter_id uuid references public.voters(id) on delete set null,
  preflight_id uuid not null unique,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  status text not null default 'submitted' check (status in ('submitted', 'superseded', 'excluded')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, voter_country_id)
);

create index if not exists jury_ballot_submissions_user_idx
  on public.jury_ballot_submissions (user_id, submitted_at desc);

alter table public.jury_votes
  add column if not exists ballot_submission_id uuid references public.jury_ballot_submissions(id) on delete set null;

create index if not exists jury_votes_ballot_submission_idx
  on public.jury_votes (ballot_submission_id);

alter table public.jury_voting_windows enable row level security;
alter table public.jury_ballot_submissions enable row level security;

drop policy if exists "Organizers can view jury voting windows" on public.jury_voting_windows;
create policy "Organizers can view jury voting windows"
  on public.jury_voting_windows for select
  to authenticated
  using (public.has_role(auth.uid(), 'organizer'::public.app_role));

drop policy if exists "Organizers can manage jury voting windows" on public.jury_voting_windows;
create policy "Organizers can manage jury voting windows"
  on public.jury_voting_windows for all
  to authenticated
  using (public.has_role(auth.uid(), 'organizer'::public.app_role))
  with check (public.has_role(auth.uid(), 'organizer'::public.app_role));

drop policy if exists "Country accounts can view own jury submissions" on public.jury_ballot_submissions;
create policy "Country accounts can view own jury submissions"
  on public.jury_ballot_submissions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Organizers can view jury submissions" on public.jury_ballot_submissions;
create policy "Organizers can view jury submissions"
  on public.jury_ballot_submissions for select
  to authenticated
  using (public.has_role(auth.uid(), 'organizer'::public.app_role));

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
  target_edition public.editions;
  participant_count integer;
  jury_enabled boolean;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'organizer'::public.app_role) then
    raise exception 'Organizer access required';
  end if;

  if _status not in ('open', 'closed') then
    raise exception 'Invalid jury voting status';
  end if;

  select * into target_show from public.shows where id = _show_id;
  if target_show is null then
    raise exception 'Show not found';
  end if;

  select * into target_edition from public.editions where id = target_show.edition_id;
  if target_edition is null then
    raise exception 'Edition not found';
  end if;

  jury_enabled := coalesce((target_show.voting_config ->> 'juryEnabled')::boolean, true);
  if _status = 'open' and not jury_enabled then
    raise exception 'Jury voting is disabled for this show';
  end if;

  if _status = 'open' then
    select count(*) into participant_count
    from public.participants p
    where p.show_id = _show_id
      and (p.participation_status is null or p.participation_status = 'confirmed');

    if participant_count < 2 then
      raise exception 'Add the show entries before opening jury voting';
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
    opened_at = case
      when excluded.status = 'open' then now()
      else public.jury_voting_windows.opened_at
    end,
    closed_at = case
      when excluded.status = 'closed' then now()
      else null
    end,
    opened_by = case
      when excluded.status = 'open' then auth.uid()
      else public.jury_voting_windows.opened_by
    end,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'show_id', _show_id,
    'status', _status
  );
end;
$$;

create or replace function public.country_jury_voting_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.country_accounts;
  country_row public.countries;
  rounds jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into account_row
  from public.country_accounts
  where user_id = auth.uid()
  limit 1;

  if account_row is null then
    return jsonb_build_object('ok', false, 'error', 'country_account_required');
  end if;

  if coalesce(account_row.status, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'account_suspended');
  end if;

  select * into country_row
  from public.countries
  where id = account_row.country_id;

  select coalesce(jsonb_agg(round_data order by edition_number desc, show_order asc), '[]'::jsonb)
  into rounds
  from (
    select
      e.edition_number,
      s.sort_order as show_order,
      jsonb_build_object(
        'show_id', s.id,
        'show_name', s.name,
        'show_kind', s.kind,
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number,
        'status', w.status,
        'opened_at', w.opened_at,
        'closed_at', w.closed_at,
        'point_scale', coalesce(s.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb),
        'allow_self_vote', coalesce((s.voting_config ->> 'allowSelfVote')::boolean, false),
        'eligible', case
          when exists (select 1 from public.voters vr where vr.show_id = s.id)
            then exists (
              select 1 from public.voters vr
              where vr.show_id = s.id and vr.country_id = account_row.country_id
            )
          else exists (
            select 1 from public.participants pp
            where pp.show_id = s.id
              and pp.country_id = account_row.country_id
              and (pp.participation_status is null or pp.participation_status = 'confirmed')
          )
        end,
        'already_submitted', (
          exists (
            select 1 from public.jury_ballot_submissions bs
            where bs.show_id = s.id and bs.voter_country_id = account_row.country_id
          )
          or exists (
            select 1 from public.jury_votes jv
            where jv.show_id = s.id and jv.voter_country_id = account_row.country_id
          )
        ),
        'entries', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'country_id', c.id,
            'name', c.name,
            'short_code', c.short_code,
            'flag_image', c.flag_image,
            'artist', p.artist,
            'song', p.song,
            'running_order', p.running_order
          ) order by coalesce(p.running_order, 9999), c.name), '[]'::jsonb)
          from public.participants p
          join public.countries c on c.id = p.country_id
          where p.show_id = s.id
            and (p.participation_status is null or p.participation_status = 'confirmed')
        )
      ) as round_data
    from public.jury_voting_windows w
    join public.shows s on s.id = w.show_id
    join public.editions e on e.id = w.edition_id
    where e.status = 'active'
  ) q;

  return jsonb_build_object(
    'ok', true,
    'country', jsonb_build_object(
      'id', country_row.id,
      'name', country_row.name,
      'short_code', country_row.short_code,
      'flag_image', country_row.flag_image,
      'username', coalesce(nullif(account_row.instagram_username, ''), nullif(account_row.display_name, ''), country_row.short_code)
    ),
    'rounds', rounds
  );
end;
$$;

create or replace function public.submit_country_jury_ballot(
  _show_id uuid,
  _entries jsonb,
  _preflight_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, televoting
as $$
declare
  account_row public.country_accounts;
  target_show public.shows;
  window_row public.jury_voting_windows;
  voter_row public.voters;
  voter_entity uuid;
  ballot_id uuid;
  preflight_row televoting.vote_preflight_checks;
  expected_points integer[];
  submitted_points integer[];
  entry_count integer;
  allow_self boolean;
  expected_map jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to your country account to jury vote';
  end if;

  select * into account_row
  from public.country_accounts
  where user_id = auth.uid()
  limit 1;

  if account_row is null or coalesce(account_row.status, 'active') <> 'active' then
    raise exception 'An active country account is required';
  end if;

  select * into target_show from public.shows where id = _show_id;
  if target_show is null then
    raise exception 'Show not found';
  end if;

  select * into window_row
  from public.jury_voting_windows
  where show_id = _show_id;

  if window_row is null or window_row.status <> 'open' then
    raise exception 'Jury voting is not open for this show';
  end if;

  if not coalesce((target_show.voting_config ->> 'juryEnabled')::boolean, true) then
    raise exception 'Jury voting is disabled for this show';
  end if;

  if exists (select 1 from public.voters where show_id = _show_id) then
    select * into voter_row
    from public.voters
    where show_id = _show_id
      and country_id = account_row.country_id
    order by sort_order, created_at
    limit 1;

    if voter_row is null then
      raise exception 'Your country is not in the jury roster for this show';
    end if;
  else
    if not exists (
      select 1 from public.participants p
      where p.show_id = _show_id
        and p.country_id = account_row.country_id
        and (p.participation_status is null or p.participation_status = 'confirmed')
    ) then
      raise exception 'Your country is not eligible to jury vote in this show';
    end if;
  end if;

  if exists (
    select 1 from public.jury_ballot_submissions bs
    where bs.show_id = _show_id and bs.voter_country_id = account_row.country_id
  ) or exists (
    select 1 from public.jury_votes jv
    where jv.show_id = _show_id and jv.voter_country_id = account_row.country_id
  ) then
    raise exception 'A jury ballot for your country is already recorded';
  end if;

  if jsonb_typeof(_entries) <> 'array' then
    raise exception 'Invalid jury ballot';
  end if;

  select array_agg(value::integer order by value::integer desc)
  into expected_points
  from jsonb_array_elements_text(coalesce(target_show.voting_config -> 'juryPoints', '[12,10,8,7,6,5,4,3,2,1]'::jsonb));

  select count(*), array_agg((entry ->> 'points')::integer order by (entry ->> 'points')::integer desc)
  into entry_count, submitted_points
  from jsonb_array_elements(_entries) entry;

  if entry_count <> coalesce(array_length(expected_points, 1), 0)
     or submitted_points is distinct from expected_points then
    raise exception 'Use every jury score exactly once';
  end if;

  if (select count(distinct entry ->> 'target_country_id') from jsonb_array_elements(_entries) entry) <> entry_count then
    raise exception 'Each country can receive only one jury score';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_entries) entry
    left join public.participants p
      on p.show_id = _show_id
     and p.country_id = (entry ->> 'target_country_id')::uuid
     and (p.participation_status is null or p.participation_status = 'confirmed')
    where p.id is null
  ) then
    raise exception 'One or more selected entries are not in this show';
  end if;

  allow_self := coalesce((target_show.voting_config ->> 'allowSelfVote')::boolean, false);
  if not allow_self and exists (
    select 1 from jsonb_array_elements(_entries) entry
    where (entry ->> 'target_country_id')::uuid = account_row.country_id
  ) then
    raise exception 'You cannot vote for your own country';
  end if;

  select coalesce(jsonb_object_agg(entry ->> 'target_country_id', (entry ->> 'points')::integer), '{}'::jsonb)
  into expected_map
  from jsonb_array_elements(_entries) entry;

  select * into preflight_row
  from televoting.vote_preflight_checks
  where id = _preflight_id
    and channel = 'jury'
    and show_id = _show_id
    and canonical_edition_id = target_show.edition_id
    and account_user_id = auth.uid()
    and submitted_at is null
    and expires_at > now()
  limit 1;

  if preflight_row is null then
    raise exception 'Run the automatic Voting Integrity System before submitting';
  end if;

  if preflight_row.ballot_map is distinct from expected_map then
    raise exception 'Your ballot changed after the integrity check. Run the check again';
  end if;

  if preflight_row.requires_attestation and preflight_row.attested_at is null then
    raise exception 'Sign the voting-integrity declaration before submitting';
  end if;

  select ce.id into voter_entity
  from public.contest_entities ce
  where ce.edition_id = target_show.edition_id
    and ce.country_id = account_row.country_id
  order by ce.created_at
  limit 1;

  insert into public.jury_ballot_submissions (
    edition_id, show_id, user_id, voter_country_id, voter_entity_id, voter_id,
    preflight_id, risk_score, status
  ) values (
    target_show.edition_id,
    _show_id,
    auth.uid(),
    account_row.country_id,
    voter_entity,
    voter_row.id,
    _preflight_id,
    preflight_row.risk_score,
    'submitted'
  ) returning id into ballot_id;

  insert into public.jury_votes (
    edition_id,
    show_id,
    voter_id,
    voter_country_id,
    voter_entity_id,
    receiving_country_id,
    receiving_entity_id,
    points,
    ballot_submission_id
  )
  select
    target_show.edition_id,
    _show_id,
    voter_row.id,
    account_row.country_id,
    voter_entity,
    (entry ->> 'target_country_id')::uuid,
    (
      select ce.id
      from public.contest_entities ce
      where ce.edition_id = target_show.edition_id
        and ce.country_id = (entry ->> 'target_country_id')::uuid
      order by ce.created_at
      limit 1
    ),
    (entry ->> 'points')::integer,
    ballot_id
  from jsonb_array_elements(_entries) entry;

  update televoting.vote_preflight_checks
  set submitted_at = now(), jury_ballot_submission_id = ballot_id
  where id = _preflight_id;

  return ballot_id;
end;
$$;

grant execute on function public.admin_set_jury_voting_status(uuid, text) to authenticated;
grant execute on function public.country_jury_voting_context() to authenticated;
grant execute on function public.submit_country_jury_ballot(uuid, jsonb, uuid) to authenticated;

revoke all on function public.admin_set_jury_voting_status(uuid, text) from anon;
revoke all on function public.country_jury_voting_context() from anon;
revoke all on function public.submit_country_jury_ballot(uuid, jsonb, uuid) from anon;
