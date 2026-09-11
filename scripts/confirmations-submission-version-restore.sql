-- Applied to the dedicated Confirmations Supabase project.
-- Adds immutable-ish provenance, version-number integrity and an organizer-only
-- restore command. A restore always captures the current state as a new version
-- BEFORE applying historical delegation-owned fields.

-- Existing rows predate provenance metadata, so label them honestly as legacy.
alter table public.submission_versions
  add column if not exists change_source text,
  add column if not exists change_reason text,
  add column if not exists actor_user_id uuid,
  add column if not exists restored_from_version_id uuid;

update public.submission_versions
set change_source = 'legacy_edit'
where change_source is null;

alter table public.submission_versions
  alter column change_source set default 'delegate_edit',
  alter column change_source set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.submission_versions'::regclass
      and conname = 'submission_versions_change_source_check'
  ) then
    alter table public.submission_versions
      add constraint submission_versions_change_source_check
      check (change_source in ('legacy_edit', 'delegate_edit', 'organizer_restore'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.submission_versions'::regclass
      and conname = 'submission_versions_version_positive_check'
  ) then
    alter table public.submission_versions
      add constraint submission_versions_version_positive_check
      check (version > 0);
  end if;

  if exists (
    select 1
    from public.submission_versions
    group by submission_id, version
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce submission version uniqueness: duplicate version numbers exist';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.submission_versions'::regclass
      and conname = 'submission_versions_submission_version_key'
  ) then
    alter table public.submission_versions
      add constraint submission_versions_submission_version_key
      unique (submission_id, version);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.submission_versions'::regclass
      and conname = 'submission_versions_restored_from_version_id_fkey'
  ) then
    alter table public.submission_versions
      add constraint submission_versions_restored_from_version_id_fkey
      foreign key (restored_from_version_id)
      references public.submission_versions(id)
      on delete set null;
  end if;
end
$$;

create index if not exists submission_versions_restored_from_idx
  on public.submission_versions(restored_from_version_id)
  where restored_from_version_id is not null;

comment on column public.submission_versions.change_source is
  'Origin of the edit represented by this pre-change snapshot: legacy_edit, delegate_edit, or organizer_restore.';
comment on column public.submission_versions.change_reason is
  'Organizer-supplied reason for a privileged change such as restoring historical submission state.';
comment on column public.submission_versions.actor_user_id is
  'Native Confirmations auth user when available. Solaris-organizer restores are authenticated cross-project and may have no local auth UUID.';
comment on column public.submission_versions.restored_from_version_id is
  'Historical version selected as the source of an organizer restore.';

-- Prevent normal API clients from rewriting history directly. The existing
-- SECURITY DEFINER submission/organizer commands remain the mutation boundary.
drop policy if exists submission_versions_organizer_all on public.submission_versions;
drop policy if exists submission_versions_organizer_select on public.submission_versions;
create policy submission_versions_organizer_select
on public.submission_versions
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

revoke all on table public.submission_versions from anon, authenticated;
grant select on table public.submission_versions to authenticated;

create or replace function public.admin_restore_confirmation_version(
  _submission_id uuid,
  _version_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  existing public.submissions;
  restored public.submissions;
  target public.submission_versions;
  target_submission jsonb;
  target_internal jsonb;
  target_nf jsonb;
  target_entries jsonb;
  current_snapshot jsonb;
  native_admin boolean := false;
  solaris_admin boolean := false;
  actor_id uuid := null;
  next_version integer;
  nf_id uuid;
  entry_id uuid;
  mapped_winner_id uuid := null;
  target_winner_text text;
  item jsonb;
  idx integer := 0;
begin
  native_admin := auth.uid() is not null
    and public.has_role(auth.uid(), 'admin'::public.app_role);
  if not native_admin then
    solaris_admin := public.is_solaris_organizer_request();
  end if;
  if not (native_admin or solaris_admin) then
    raise exception 'Forbidden';
  end if;

  if nullif(btrim(coalesce(_reason, '')), '') is null then
    raise exception 'Restore reason is required';
  end if;

  select * into existing
  from public.submissions
  where id = _submission_id
  for update;

  if existing.id is null then
    raise exception 'Submission not found';
  end if;

  select * into target
  from public.submission_versions
  where id = _version_id
    and submission_id = _submission_id;

  if target.id is null then
    raise exception 'Historical version not found for this submission';
  end if;

  target_submission := coalesce(target.snapshot -> 'submission', '{}'::jsonb);
  target_internal := target.snapshot -> 'internal';
  target_nf := target.snapshot -> 'national_final';
  target_entries := case
    when jsonb_typeof(target.snapshot -> 'nf_entries') = 'array'
      then target.snapshot -> 'nf_entries'
    else '[]'::jsonb
  end;
  target_winner_text := nullif(target.snapshot #>> '{national_final,winning_entry_id}', '');

  current_snapshot := jsonb_build_object(
    'submission', to_jsonb(existing),
    'internal', (
      select to_jsonb(i)
      from public.internal_entries i
      where i.submission_id = existing.id
      limit 1
    ),
    'national_final', (
      select to_jsonb(n)
      from public.national_finals n
      where n.submission_id = existing.id
      limit 1
    ),
    'nf_entries', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.position), '[]'::jsonb)
      from public.national_final_entries e
      join public.national_finals n on n.id = e.national_final_id
      where n.submission_id = existing.id
    )
  );

  select greatest(
    existing.edit_count,
    coalesce(max(v.version), 0)
  ) + 1
  into next_version
  from public.submission_versions v
  where v.submission_id = existing.id;

  actor_id := case when native_admin then auth.uid() else null end;

  insert into public.submission_versions(
    submission_id,
    version,
    snapshot,
    change_source,
    change_reason,
    actor_user_id,
    restored_from_version_id
  ) values (
    existing.id,
    next_version,
    current_snapshot,
    'organizer_restore',
    btrim(_reason),
    actor_id,
    target.id
  );

  update public.submissions
  set
    instagram_username = case
      when target_submission ? 'instagram_username'
        then coalesce(nullif(target_submission ->> 'instagram_username', ''), instagram_username)
      else instagram_username
    end,
    country_account = case
      when target_submission ? 'country_account'
        then nullif(target_submission ->> 'country_account', '')
      else country_account
    end,
    has_country_account = case
      when target_submission ? 'has_country_account'
        then coalesce((target_submission ->> 'has_country_account')::boolean, has_country_account)
      else has_country_account
    end,
    participating = case
      when target_submission ? 'participating'
        then coalesce((target_submission ->> 'participating')::boolean, participating)
      else participating
    end,
    selection_method = case
      when target_submission ? 'selection_method'
        then nullif(target_submission ->> 'selection_method', '')
      else selection_method
    end,
    entry_unknown = case
      when target_submission ? 'entry_unknown'
        then coalesce((target_submission ->> 'entry_unknown')::boolean, entry_unknown)
      else entry_unknown
    end,
    nf_entries_unknown = case
      when target_submission ? 'nf_entries_unknown'
        then coalesce((target_submission ->> 'nf_entries_unknown')::boolean, nf_entries_unknown)
      else nf_entries_unknown
    end,
    reveal_date_type = case when target_submission ? 'reveal_date_type' then nullif(target_submission ->> 'reveal_date_type', '') else reveal_date_type end,
    reveal_exact_date = case when target_submission ? 'reveal_exact_date' then nullif(target_submission ->> 'reveal_exact_date', '')::date else reveal_exact_date end,
    reveal_approximate_text = case when target_submission ? 'reveal_approximate_text' then nullif(target_submission ->> 'reveal_approximate_text', '') else reveal_approximate_text end,
    nf_date_type = case when target_submission ? 'nf_date_type' then nullif(target_submission ->> 'nf_date_type', '') else nf_date_type end,
    nf_exact_date = case when target_submission ? 'nf_exact_date' then nullif(target_submission ->> 'nf_exact_date', '')::date else nf_exact_date end,
    nf_approximate_text = case when target_submission ? 'nf_approximate_text' then nullif(target_submission ->> 'nf_approximate_text', '') else nf_approximate_text end,
    nf_result_date_type = case when target_submission ? 'nf_result_date_type' then nullif(target_submission ->> 'nf_result_date_type', '') else nf_result_date_type end,
    nf_result_exact_date = case when target_submission ? 'nf_result_exact_date' then nullif(target_submission ->> 'nf_result_exact_date', '')::date else nf_result_exact_date end,
    nf_result_approximate_text = case when target_submission ? 'nf_result_approximate_text' then nullif(target_submission ->> 'nf_result_approximate_text', '') else nf_result_approximate_text end,
    edit_count = next_version,
    updated_at = now()
  where id = existing.id
  returning * into restored;

  -- Restore delegation-owned entry content, but never historical organizer
  -- approvals/declines/removals. Anything restored must be reviewed again.
  if not restored.participating
     or restored.selection_method is null
     or restored.selection_method = 'unknown' then
    delete from public.internal_entries where submission_id = restored.id;
    delete from public.national_finals where submission_id = restored.id;

  elsif restored.selection_method = 'internal' then
    delete from public.national_finals where submission_id = restored.id;

    if jsonb_typeof(target_internal) = 'object' then
      insert into public.internal_entries(
        submission_id,
        artist,
        song_title,
        song_url,
        preview_start,
        preview_end,
        final_clip_start,
        final_clip_end,
        replacement_video_required,
        replacement_video_url,
        review_status,
        review_reason,
        reviewed_at,
        reviewed_by
      ) values (
        restored.id,
        nullif(target_internal ->> 'artist', ''),
        nullif(target_internal ->> 'song_title', ''),
        nullif(target_internal ->> 'song_url', ''),
        nullif(target_internal ->> 'preview_start', ''),
        nullif(target_internal ->> 'preview_end', ''),
        nullif(target_internal ->> 'final_clip_start', ''),
        nullif(target_internal ->> 'final_clip_end', ''),
        coalesce((target_internal ->> 'replacement_video_required')::boolean, false),
        nullif(target_internal ->> 'replacement_video_url', ''),
        'pending',
        null,
        null,
        null
      )
      on conflict (submission_id) do update set
        artist = excluded.artist,
        song_title = excluded.song_title,
        song_url = excluded.song_url,
        preview_start = excluded.preview_start,
        preview_end = excluded.preview_end,
        final_clip_start = excluded.final_clip_start,
        final_clip_end = excluded.final_clip_end,
        replacement_video_required = excluded.replacement_video_required,
        replacement_video_url = excluded.replacement_video_url,
        review_status = 'pending',
        review_reason = null,
        reviewed_at = null,
        reviewed_by = null;
    else
      delete from public.internal_entries where submission_id = restored.id;
    end if;

  elsif restored.selection_method = 'national_final' then
    delete from public.internal_entries where submission_id = restored.id;

    select id into nf_id
    from public.national_finals
    where submission_id = restored.id
    limit 1;

    if nf_id is null then
      insert into public.national_finals(
        submission_id,
        nf_name,
        expected_entry_count,
        winning_entry_id
      ) values (
        restored.id,
        case when jsonb_typeof(target_nf) = 'object' then nullif(target_nf ->> 'nf_name', '') else null end,
        case when jsonb_typeof(target_nf) = 'object' then nullif(target_nf ->> 'expected_entry_count', '')::integer else null end,
        null
      ) returning id into nf_id;
    else
      update public.national_finals
      set
        nf_name = case when jsonb_typeof(target_nf) = 'object' then nullif(target_nf ->> 'nf_name', '') else null end,
        expected_entry_count = case when jsonb_typeof(target_nf) = 'object' then nullif(target_nf ->> 'expected_entry_count', '')::integer else null end,
        winning_entry_id = null
      where id = nf_id;
    end if;

    -- Preserve already-removed moderation records. Current active entries that
    -- do not exist in the target delegation snapshot are removed from the
    -- active lineup, matching ordinary delegation edit behavior.
    delete from public.national_final_entries e
    where e.national_final_id = nf_id
      and coalesce(e.removed, false) = false
      and not exists (
        select 1
        from jsonb_array_elements(target_entries) incoming
        where coalesce((incoming ->> 'removed')::boolean, false) = false
          and public.normalize_entry_text(incoming ->> 'artist') = public.normalize_entry_text(e.artist)
          and public.normalize_entry_text(incoming ->> 'song_title') = public.normalize_entry_text(e.song_title)
      );

    idx := 0;
    mapped_winner_id := null;
    for item in select value from jsonb_array_elements(target_entries) loop
      if coalesce((item ->> 'removed')::boolean, false) then
        continue;
      end if;

      entry_id := null;
      select e.id into entry_id
      from public.national_final_entries e
      where e.national_final_id = nf_id
        and coalesce(e.removed, false) = false
        and public.normalize_entry_text(e.artist) = public.normalize_entry_text(item ->> 'artist')
        and public.normalize_entry_text(e.song_title) = public.normalize_entry_text(item ->> 'song_title')
      limit 1;

      if entry_id is null then
        insert into public.national_final_entries(
          national_final_id,
          artist,
          song_title,
          song_url,
          position,
          preview_start,
          preview_end,
          final_clip_start,
          final_clip_end,
          replacement_video_required,
          replacement_video_url,
          review_status,
          review_reason,
          reviewed_at,
          reviewed_by,
          removed,
          removed_at
        ) values (
          nf_id,
          nullif(item ->> 'artist', ''),
          nullif(item ->> 'song_title', ''),
          nullif(item ->> 'song_url', ''),
          idx,
          nullif(item ->> 'preview_start', ''),
          nullif(item ->> 'preview_end', ''),
          nullif(item ->> 'final_clip_start', ''),
          nullif(item ->> 'final_clip_end', ''),
          coalesce((item ->> 'replacement_video_required')::boolean, false),
          nullif(item ->> 'replacement_video_url', ''),
          'pending',
          null,
          null,
          null,
          false,
          null
        ) returning id into entry_id;
      else
        update public.national_final_entries
        set
          artist = nullif(item ->> 'artist', ''),
          song_title = nullif(item ->> 'song_title', ''),
          song_url = nullif(item ->> 'song_url', ''),
          position = idx,
          preview_start = nullif(item ->> 'preview_start', ''),
          preview_end = nullif(item ->> 'preview_end', ''),
          final_clip_start = nullif(item ->> 'final_clip_start', ''),
          final_clip_end = nullif(item ->> 'final_clip_end', ''),
          replacement_video_required = coalesce((item ->> 'replacement_video_required')::boolean, false),
          replacement_video_url = nullif(item ->> 'replacement_video_url', ''),
          review_status = 'pending',
          review_reason = null,
          reviewed_at = null,
          reviewed_by = null,
          removed = false,
          removed_at = null
        where id = entry_id;
      end if;

      if target_winner_text is not null and item ->> 'id' = target_winner_text then
        mapped_winner_id := entry_id;
      end if;

      idx := idx + 1;
    end loop;

    update public.national_finals
    set winning_entry_id = mapped_winner_id
    where id = nf_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'submission_id', restored.id,
    'captured_version', next_version,
    'restored_from_version_id', target.id
  );
end;
$$;

revoke all on function public.admin_restore_confirmation_version(uuid, uuid, text) from public;
grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)
  to anon, authenticated, service_role;

-- Extend the safe read RPC with provenance metadata. Raw snapshots remain
-- server-side whitelisted exactly as before.
create or replace function public.admin_confirmation_versions(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not ((auth.uid() is not null and public.has_role(auth.uid(), 'admin'::public.app_role)) or public.is_solaris_organizer_request()) then
    raise exception 'Forbidden';
  end if;

  if not exists (select 1 from public.submissions where id = _submission_id) then
    raise exception 'Submission not found';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'submission_id', v.submission_id,
        'version', v.version,
        'created_at', v.created_at,
        'change_source', v.change_source,
        'change_reason', v.change_reason,
        'actor_user_id', v.actor_user_id,
        'restored_from_version_id', v.restored_from_version_id,
        'snapshot', jsonb_build_object(
          'submission', jsonb_build_object(
            'participating', v.snapshot #> '{submission,participating}',
            'selection_method', v.snapshot #> '{submission,selection_method}',
            'entry_unknown', v.snapshot #> '{submission,entry_unknown}',
            'nf_entries_unknown', v.snapshot #> '{submission,nf_entries_unknown}',
            'reveal_date_type', v.snapshot #> '{submission,reveal_date_type}',
            'reveal_exact_date', v.snapshot #> '{submission,reveal_exact_date}',
            'reveal_approximate_text', v.snapshot #> '{submission,reveal_approximate_text}',
            'nf_date_type', v.snapshot #> '{submission,nf_date_type}',
            'nf_exact_date', v.snapshot #> '{submission,nf_exact_date}',
            'nf_approximate_text', v.snapshot #> '{submission,nf_approximate_text}',
            'nf_result_date_type', v.snapshot #> '{submission,nf_result_date_type}',
            'nf_result_exact_date', v.snapshot #> '{submission,nf_result_exact_date}',
            'nf_result_approximate_text', v.snapshot #> '{submission,nf_result_approximate_text}'
          ),
          'internal', case
            when jsonb_typeof(v.snapshot -> 'internal') = 'object' then jsonb_build_object(
              'artist', v.snapshot #> '{internal,artist}',
              'song_title', v.snapshot #> '{internal,song_title}',
              'song_url', v.snapshot #> '{internal,song_url}',
              'preview_start', v.snapshot #> '{internal,preview_start}',
              'preview_end', v.snapshot #> '{internal,preview_end}',
              'final_clip_start', v.snapshot #> '{internal,final_clip_start}',
              'final_clip_end', v.snapshot #> '{internal,final_clip_end}',
              'replacement_video_required', v.snapshot #> '{internal,replacement_video_required}',
              'replacement_video_url', v.snapshot #> '{internal,replacement_video_url}'
            )
            else null
          end,
          'national_final', case
            when jsonb_typeof(v.snapshot -> 'national_final') = 'object' then jsonb_build_object(
              'nf_name', v.snapshot #> '{national_final,nf_name}',
              'expected_entry_count', v.snapshot #> '{national_final,expected_entry_count}',
              'winning_entry_id', v.snapshot #> '{national_final,winning_entry_id}'
            )
            else null
          end,
          'nf_entries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'artist', item.entry -> 'artist',
                'song_title', item.entry -> 'song_title',
                'song_url', item.entry -> 'song_url',
                'position', item.entry -> 'position',
                'removed', item.entry -> 'removed'
              )
              order by item.ordinality
            )
            from jsonb_array_elements(
              case
                when jsonb_typeof(v.snapshot -> 'nf_entries') = 'array' then v.snapshot -> 'nf_entries'
                else '[]'::jsonb
              end
            ) with ordinality as item(entry, ordinality)
          ), '[]'::jsonb)
        )
      )
      order by v.version asc
    )
    from public.submission_versions v
    where v.submission_id = _submission_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_confirmation_versions(uuid) from public;
grant execute on function public.admin_confirmation_versions(uuid)
  to anon, authenticated, service_role;
