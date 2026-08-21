-- Beta 2: country-owned entry reveal scheduling, automatic publication and
-- public national-final history. Existing entries stay public unless a country
-- explicitly starts managing their reveal state.

alter table public.participants
  add column if not exists publication_status text,
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists publication_source text,
  add column if not exists publication_overridden boolean;

update public.participants
set publication_status = coalesce(publication_status, 'published'),
    publication_source = coalesce(publication_source, 'legacy'),
    publication_overridden = coalesce(publication_overridden, false)
where publication_status is null
   or publication_source is null
   or publication_overridden is null;

alter table public.participants
  alter column publication_status set default 'published',
  alter column publication_status set not null,
  alter column publication_source set default 'legacy',
  alter column publication_source set not null,
  alter column publication_overridden set default false,
  alter column publication_overridden set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_publication_status_check'
  ) then
    alter table public.participants
      add constraint participants_publication_status_check
      check (publication_status in ('draft', 'scheduled', 'published'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.participants'::regclass
      and conname = 'participants_publication_source_check'
  ) then
    alter table public.participants
      add constraint participants_publication_source_check
      check (publication_source in ('legacy', 'manual', 'confirmation'));
  end if;
end $$;

create index if not exists participants_scheduled_publish_idx
  on public.participants (scheduled_publish_at)
  where publication_status = 'scheduled' and show_id is null;

create or replace function public.owned_country_entry_publication(_edition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_country_id uuid;
  v_row public.participants;
begin
  select ca.country_id
    into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  select p.*
    into v_row
  from public.participants p
  left join public.contest_entities ce on ce.id = p.contest_entity_id
  where p.edition_id = _edition_id
    and p.show_id is null
    and (p.country_id = v_country_id or ce.country_id = v_country_id)
  order by p.updated_at desc, p.created_at desc, p.id desc
  limit 1;

  if v_row.id is null then
    return jsonb_build_object('exists', false, 'edition_id', _edition_id);
  end if;

  return jsonb_build_object(
    'exists', true,
    'participant_id', v_row.id,
    'edition_id', v_row.edition_id,
    'country_id', v_country_id,
    'artist', v_row.artist,
    'song', v_row.song,
    'publication_status', v_row.publication_status,
    'scheduled_publish_at', v_row.scheduled_publish_at,
    'published_at', v_row.published_at,
    'publication_source', v_row.publication_source,
    'publication_overridden', v_row.publication_overridden
  );
end;
$$;

create or replace function public.emit_entry_published_event(
  _edition_id uuid,
  _country_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_country public.countries;
  v_edition public.editions;
  v_entry public.participants;
  v_title text;
begin
  select * into v_country from public.countries where id = _country_id;
  select * into v_edition from public.editions where id = _edition_id;

  select p.* into v_entry
  from public.participants p
  where p.edition_id = _edition_id
    and p.show_id is null
    and p.country_id = _country_id
  order by p.updated_at desc, p.created_at desc
  limit 1;

  if v_country.id is null or v_entry.id is null then
    return;
  end if;

  v_title := v_country.name || ' revealed ' || coalesce(nullif(v_entry.song, ''), 'its entry');

  insert into public.content_events (
    event_type,
    entity_type,
    entity_id,
    title,
    summary,
    route,
    importance,
    payload,
    published_at,
    dedupe_key
  ) values (
    'entry_published',
    'country',
    _country_id,
    v_title,
    case
      when nullif(v_entry.artist, '') is not null and nullif(v_entry.song, '') is not null
        then v_entry.artist || ' — ' || v_entry.song ||
          case when v_edition.edition_number is not null then ' · SSC' || v_edition.edition_number::text else '' end
      else 'A new Solaris Song Contest entry is now public.'
    end,
    '/countries/' || v_country.short_code,
    'important',
    jsonb_build_object(
      'countryId', _country_id,
      'editionId', _edition_id,
      'participantId', v_entry.id,
      'artist', v_entry.artist,
      'song', v_entry.song
    ),
    now(),
    'entry-published:' || _edition_id::text || ':' || _country_id::text
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function public.set_owned_country_entry_publication(
  _edition_id uuid,
  _mode text,
  _scheduled_at timestamptz default null,
  _source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_country_id uuid;
  v_row public.participants;
  v_current public.participants;
begin
  select ca.country_id
    into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  if _source not in ('manual', 'confirmation') then
    raise exception 'Invalid publication source.' using errcode = '22023';
  end if;

  select p.* into v_current
  from public.participants p
  left join public.contest_entities ce on ce.id = p.contest_entity_id
  where p.edition_id = _edition_id
    and p.show_id is null
    and (p.country_id = v_country_id or ce.country_id = v_country_id)
  order by p.updated_at desc, p.created_at desc, p.id desc
  limit 1;

  if v_current.id is null then
    raise exception 'No entry exists for this edition.' using errcode = '22023';
  end if;

  if _mode in ('schedule', 'draft')
     and v_current.publication_status = 'published'
     and v_current.published_at is not null then
    raise exception 'A managed entry that is already public cannot be hidden again.' using errcode = '22023';
  end if;

  if _mode = 'schedule' then
    if _scheduled_at is null or _scheduled_at <= now() then
      raise exception 'Choose a reveal time in the future.' using errcode = '22023';
    end if;

    update public.participants p
    set publication_status = 'scheduled',
        scheduled_publish_at = _scheduled_at,
        published_at = null,
        publication_source = _source,
        publication_overridden = (_source = 'manual'),
        updated_at = now()
    where p.edition_id = _edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id and ce.country_id = v_country_id
        )
      );
  elsif _mode = 'draft' then
    update public.participants p
    set publication_status = 'draft',
        scheduled_publish_at = null,
        published_at = null,
        publication_source = _source,
        publication_overridden = (_source = 'manual'),
        updated_at = now()
    where p.edition_id = _edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id and ce.country_id = v_country_id
        )
      );
  elsif _mode = 'publish' then
    update public.participants p
    set publication_status = 'published',
        scheduled_publish_at = null,
        published_at = coalesce(p.published_at, now()),
        publication_source = _source,
        publication_overridden = (_source = 'manual'),
        updated_at = now()
    where p.edition_id = _edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id and ce.country_id = v_country_id
        )
      );

    perform public.emit_entry_published_event(_edition_id, v_country_id);
  else
    raise exception 'Unknown publication action.' using errcode = '22023';
  end if;

  select p.* into v_row
  from public.participants p
  where p.edition_id = _edition_id
    and p.show_id is null
    and p.country_id = v_country_id
  order by p.updated_at desc, p.created_at desc
  limit 1;

  return jsonb_build_object(
    'exists', true,
    'participant_id', v_row.id,
    'edition_id', v_row.edition_id,
    'country_id', v_country_id,
    'artist', v_row.artist,
    'song', v_row.song,
    'publication_status', v_row.publication_status,
    'scheduled_publish_at', v_row.scheduled_publish_at,
    'published_at', v_row.published_at,
    'publication_source', v_row.publication_source,
    'publication_overridden', v_row.publication_overridden
  );
end;
$$;

create or replace function public.publish_due_entries()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_entry record;
  v_count integer := 0;
begin
  for v_entry in
    select distinct p.edition_id, p.country_id
    from public.participants p
    where p.show_id is null
      and p.country_id is not null
      and p.publication_status = 'scheduled'
      and p.scheduled_publish_at is not null
      and p.scheduled_publish_at <= now()
  loop
    update public.participants p
    set publication_status = 'published',
        published_at = coalesce(p.published_at, now()),
        scheduled_publish_at = null,
        updated_at = now()
    where p.edition_id = v_entry.edition_id
      and p.country_id = v_entry.country_id
      and p.publication_status = 'scheduled';

    if found then
      perform public.emit_entry_published_event(v_entry.edition_id, v_entry.country_id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- New country-account entries begin as drafts. Existing entries keep their
-- current publication state when their details are edited.
create or replace function public.upsert_owned_country_edition_entry(
  _edition_id uuid,
  _artist text,
  _song text,
  _notes text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_country_id uuid;
  v_existing boolean;
  v_result jsonb;
begin
  select ca.country_id
    into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  select exists(
    select 1
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.edition_id = _edition_id
      and p.show_id is null
      and (p.country_id = v_country_id or ce.country_id = v_country_id)
  ) into v_existing;

  v_result := public.upsert_country_edition_entry_internal(
    v_country_id,
    null,
    _edition_id,
    _artist,
    _song,
    _notes
  );

  if not v_existing then
    update public.participants p
    set publication_status = 'draft',
        scheduled_publish_at = null,
        published_at = null,
        publication_source = 'manual',
        publication_overridden = false
    where p.edition_id = _edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id and ce.country_id = v_country_id
        )
      );
  end if;

  return v_result;
end;
$$;

create or replace function public.public_country_national_finals(_country_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_country public.countries;
  v_result jsonb;
begin
  select * into v_country from public.countries where id = _country_id;
  if v_country.id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(item order by edition_number desc nulls last, nf_name), '[]'::jsonb)
  into v_result
  from (
    select
      e.edition_number,
      nf.nf_name,
      jsonb_build_object(
        'id', nf.id,
        'name', nf.nf_name,
        'expected_entry_count', nf.expected_entry_count,
        'winning_entry_id', nf.winning_entry_id,
        'edition_id', e.id,
        'edition_number', e.edition_number,
        'edition_name', e.name,
        'edition_slug', e.slug,
        'nf_date', s.nf_exact_date,
        'result_date', s.nf_result_exact_date,
        'entries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', nfe.id,
              'artist', nfe.artist,
              'song_title', nfe.song_title,
              'song_url', nfe.song_url,
              'position', nfe.position,
              'winner', nfe.id = nf.winning_entry_id
            )
            order by nfe.position nulls last, nfe.artist, nfe.song_title
          )
          from public.national_final_entries nfe
          where nfe.national_final_id = nf.id
            and coalesce(nfe.removed, false) = false
            and nfe.review_status = 'accepted'
        ), '[]'::jsonb)
      ) as item
    from public.national_finals nf
    join public.submissions s on s.id = nf.submission_id
    left join public.editions e on e.id = s.edition_id
    where lower(trim(s.country)) in (lower(trim(v_country.name)), lower(trim(v_country.short_code)))
  ) q;

  return v_result;
end;
$$;

grant execute on function public.owned_country_entry_publication(uuid) to authenticated;
grant execute on function public.set_owned_country_entry_publication(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.public_country_national_finals(uuid) to anon, authenticated;
revoke all on function public.publish_due_entries() from public, anon, authenticated;
revoke all on function public.emit_entry_published_event(uuid, uuid) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'solaris-publish-due-entries' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'solaris-publish-due-entries',
    '* * * * *',
    'select public.publish_due_entries();'
  );
end $$;
