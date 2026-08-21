-- Feed future national-final activity into the existing Solaris Pulse event
-- stream. Old national finals remain available in country history without
-- flooding Pulse retroactively.

alter table public.content_events
  drop constraint if exists content_events_event_type_check;

alter table public.content_events
  add constraint content_events_event_type_check
  check (event_type = any (array[
    'entry_published'::text,
    'running_order_published'::text,
    'prediction_opened'::text,
    'prediction_locked'::text,
    'prediction_movement'::text,
    'results_published'::text,
    'record_broken'::text,
    'record_threat'::text,
    'story_published'::text,
    'edition_update'::text,
    'national_final_announced'::text,
    'national_final_lineup'::text,
    'national_final_result'::text
  ]));

create or replace function public.emit_national_final_event(
  _national_final_id uuid,
  _event_type text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nf public.national_finals;
  v_submission public.submissions;
  v_edition public.editions;
  v_country public.countries;
  v_winner public.national_final_entries;
  v_accepted_count integer := 0;
  v_title text;
  v_summary text;
  v_dedupe text;
begin
  if _event_type not in ('national_final_announced', 'national_final_lineup', 'national_final_result') then
    return;
  end if;

  select * into v_nf from public.national_finals where id = _national_final_id;
  if v_nf.id is null then return; end if;

  select * into v_submission from public.submissions where id = v_nf.submission_id;
  if v_submission.id is null then return; end if;

  select * into v_edition from public.editions where id = v_submission.edition_id;

  select * into v_country
  from public.countries c
  where lower(trim(c.name)) = lower(trim(v_submission.country))
     or lower(trim(c.short_code)) = lower(trim(v_submission.country))
  limit 1;
  if v_country.id is null then return; end if;

  select count(*) into v_accepted_count
  from public.national_final_entries nfe
  where nfe.national_final_id = v_nf.id
    and coalesce(nfe.removed, false) = false
    and nfe.review_status = 'accepted';

  if v_nf.winning_entry_id is not null then
    select * into v_winner
    from public.national_final_entries
    where id = v_nf.winning_entry_id
      and coalesce(removed, false) = false;
  end if;

  if _event_type = 'national_final_announced' then
    v_title := v_country.name || ' announced ' || v_nf.nf_name;
    v_summary := 'A national final has been added for ' ||
      coalesce('SSC' || v_edition.edition_number::text, 'an upcoming Solaris edition') || '.';
    v_dedupe := 'nf-announced:' || v_nf.id::text;
  elsif _event_type = 'national_final_lineup' then
    if v_nf.expected_entry_count is null
       or v_nf.expected_entry_count <= 0
       or v_accepted_count < v_nf.expected_entry_count then
      return;
    end if;
    v_title := v_nf.nf_name || ' lineup is complete';
    v_summary := v_country.name || ' has ' || v_accepted_count::text ||
      ' accepted national-final entries in Solaris.';
    v_dedupe := 'nf-lineup:' || v_nf.id::text;
  else
    if v_winner.id is null then return; end if;
    v_title := v_country.name || ' selected ' || coalesce(nullif(v_winner.song_title, ''), 'its SSC entry');
    v_summary := coalesce(nullif(v_winner.artist, ''), 'The winning artist') ||
      case when nullif(v_winner.song_title, '') is not null then ' — ' || v_winner.song_title else '' end ||
      ' won ' || v_nf.nf_name || '.';
    v_dedupe := 'nf-result:' || v_nf.id::text;
  end if;

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
    _event_type,
    'country',
    v_country.id,
    v_title,
    v_summary,
    '/countries/' || v_country.short_code,
    case when _event_type = 'national_final_result' then 'important' else 'normal' end,
    jsonb_build_object(
      'countryId', v_country.id,
      'editionId', v_submission.edition_id,
      'nationalFinalId', v_nf.id,
      'nationalFinalName', v_nf.nf_name,
      'acceptedEntryCount', v_accepted_count,
      'winningEntryId', v_nf.winning_entry_id
    ),
    now(),
    v_dedupe
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function public.national_final_pulse_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.emit_national_final_event(new.id, 'national_final_announced');
  elsif tg_op = 'UPDATE'
        and new.winning_entry_id is distinct from old.winning_entry_id
        and new.winning_entry_id is not null then
    perform public.emit_national_final_event(new.id, 'national_final_result');
  end if;
  return new;
end;
$$;

create or replace function public.national_final_entry_pulse_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.review_status = 'accepted'
     and coalesce(new.removed, false) = false
     and (tg_op = 'INSERT' or old.review_status is distinct from new.review_status or old.removed is distinct from new.removed) then
    perform public.emit_national_final_event(new.national_final_id, 'national_final_lineup');
  end if;
  return new;
end;
$$;

drop trigger if exists national_final_pulse on public.national_finals;
create trigger national_final_pulse
after insert or update of winning_entry_id on public.national_finals
for each row execute function public.national_final_pulse_trigger();

drop trigger if exists national_final_entry_pulse on public.national_final_entries;
create trigger national_final_entry_pulse
after insert or update of review_status, removed on public.national_final_entries
for each row execute function public.national_final_entry_pulse_trigger();

revoke all on function public.emit_national_final_event(uuid, text) from public, anon, authenticated;
