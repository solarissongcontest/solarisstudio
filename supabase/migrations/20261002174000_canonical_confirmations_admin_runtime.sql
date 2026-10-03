-- Mobile App V2 / Supabase cutover: canonical Confirmations admin runtime


-- Canonical Confirmations organizer runtime.
-- Retires the dedicated Confirmations Supabase dependency and exposes the
-- legacy organizer RPC contract against Solaris Studio's canonical database.

create or replace function private.solaris_confirmation_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select public.studio2_access_allowed('delegation.manage', null, true);
$$;

revoke all on function private.solaris_confirmation_admin_allowed() from public, anon, authenticated;
grant execute on function private.solaris_confirmation_admin_allowed() to service_role;

create or replace function public.admin_confirmation_editions()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select case
    when private.solaris_confirmation_admin_allowed() then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'edition_number', e.edition_number,
          'description', e.description,
          'status', case when e.status = 'completed' then 'finished' else e.status end,
          'editing_enabled', coalesce(e.editing_enabled, false),
          'created_at', e.created_at,
          'response_count', (
            select count(*)::integer from public.submissions s where s.edition_id = e.id
          ),
          'rounds', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'edition_id', r.edition_id,
                'name', r.name,
                'status', r.status,
                'editing_enabled', coalesce(r.editing_enabled, false),
                'opens_at', r.opens_at,
                'closes_at', r.closes_at,
                'response_limit', r.response_limit,
                'response_count', (
                  select count(*)::integer from public.submissions sr where sr.round_id = r.id
                ),
                'created_at', r.created_at
              )
              order by r.created_at, r.name
            )
            from public.submission_rounds r
            where r.edition_id = e.id
          ), '[]'::jsonb)
        )
        order by e.edition_number desc nulls last, e.created_at desc
      )
      from public.editions e
      where e.published = true
         or exists (select 1 from public.submission_rounds r where r.edition_id = e.id)
    ), '[]'::jsonb)
    else (select null::jsonb from (select 1) denied where false)
  end;
$$;

create or replace function public.admin_confirmation_save_edition(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_number integer := nullif(_payload ->> 'edition_number', '')::integer;
  v_name text := nullif(btrim(_payload ->> 'name'), '');
  v_description text := nullif(btrim(_payload ->> 'description'), '');
  v_legacy_status text := coalesce(nullif(_payload ->> 'status', ''), 'draft');
  v_status text;
  v_editing boolean := coalesce((_payload ->> 'editing_enabled')::boolean, false);
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if v_name is null or v_number is null then
    raise exception 'Edition name and number are required' using errcode='22023';
  end if;
  if v_legacy_status not in ('draft','active','finished','completed') then
    raise exception 'Invalid edition status' using errcode='22023';
  end if;

  v_status := case when v_legacy_status in ('finished','completed') then 'completed' else v_legacy_status end;

  if v_id is null then
    insert into public.editions(name, edition_number, description, status, editing_enabled, slug, published)
    values (
      v_name,
      v_number,
      v_description,
      v_status,
      v_editing,
      'ssc-' || v_number::text,
      v_status <> 'draft'
    )
    returning id into v_id;
  else
    update public.editions
    set name = v_name,
        edition_number = v_number,
        description = v_description,
        status = v_status,
        editing_enabled = v_editing,
        published = case when v_status = 'draft' then published else true end
    where id = v_id;
    if not found then raise exception 'Edition not found' using errcode='22023'; end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_confirmation_delete_edition(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if exists (select 1 from public.shows where edition_id = _id)
     or exists (select 1 from public.participants where edition_id = _id) then
    raise exception 'This is a canonical contest edition. Delete it from Organizer edition management, not Confirmations.' using errcode='22023';
  end if;
  delete from public.editions where id = _id;
  return found;
end;
$$;

create or replace function public.admin_confirmation_set_edition_editing(_id uuid, _enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  update public.editions set editing_enabled = _enabled where id = _id;
  return found;
end;
$$;

create or replace function public.admin_confirmation_save_round(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_edition_id uuid := nullif(_payload ->> 'edition_id', '')::uuid;
  v_name text := nullif(btrim(_payload ->> 'name'), '');
  v_status text := coalesce(nullif(_payload ->> 'status', ''), 'draft');
  v_opens_at timestamptz := nullif(_payload ->> 'opens_at', '')::timestamptz;
  v_closes_at timestamptz := nullif(_payload ->> 'closes_at', '')::timestamptz;
  v_limit integer := nullif(_payload ->> 'response_limit', '')::integer;
  v_editing boolean := coalesce((_payload ->> 'editing_enabled')::boolean, false);
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if v_edition_id is null or v_name is null then
    raise exception 'Edition and round name are required' using errcode='22023';
  end if;
  if v_status not in ('draft','open','closed','auto_closed') then
    raise exception 'Invalid round status' using errcode='22023';
  end if;
  if v_limit is not null and v_limit < 1 then
    raise exception 'Response limit must be positive' using errcode='22023';
  end if;
  if v_closes_at is not null and v_opens_at is not null and v_closes_at <= v_opens_at then
    raise exception 'Round closing time must be after opening time' using errcode='22023';
  end if;

  if v_id is null then
    insert into public.submission_rounds(
      edition_id,name,status,opens_at,closes_at,response_limit,editing_enabled
    ) values (
      v_edition_id,v_name,v_status,v_opens_at,v_closes_at,v_limit,v_editing
    ) returning id into v_id;
  else
    update public.submission_rounds
    set edition_id=v_edition_id,
        name=v_name,
        status=v_status,
        opens_at=v_opens_at,
        closes_at=v_closes_at,
        response_limit=v_limit,
        editing_enabled=v_editing
    where id=v_id;
    if not found then raise exception 'Round not found' using errcode='22023'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_confirmation_delete_round(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if exists (select 1 from public.submissions where round_id = _id) then
    raise exception 'A round with responses cannot be deleted. Close it instead.' using errcode='22023';
  end if;
  delete from public.submission_rounds where id=_id;
  return found;
end;
$$;

create or replace function public.admin_confirmation_set_round_status(_id uuid, _status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if _status not in ('draft','open','closed','auto_closed') then
    raise exception 'Invalid round status' using errcode='22023';
  end if;
  update public.submission_rounds set status=_status where id=_id;
  return found;
end;
$$;

create or replace function public.admin_confirmation_set_round_editing(_id uuid, _enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  update public.submission_rounds set editing_enabled=_enabled where id=_id;
  return found;
end;
$$;

create or replace function public.admin_confirmation_calendar(
  _edition_id uuid default null,
  _round_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'country', s.country,
      'participating', s.participating,
      'selection_method', s.selection_method,
      'reveal_date_type', s.reveal_date_type,
      'reveal_exact_date', s.reveal_exact_date,
      'reveal_approximate_text', s.reveal_approximate_text,
      'nf_date_type', s.nf_date_type,
      'nf_exact_date', s.nf_exact_date,
      'nf_approximate_text', s.nf_approximate_text,
      'nf_result_date_type', s.nf_result_date_type,
      'nf_result_exact_date', s.nf_result_exact_date,
      'nf_result_approximate_text', s.nf_result_approximate_text,
      'edition_id', s.edition_id,
      'round_id', s.round_id,
      'edition_name', e.name,
      'edition_number', e.edition_number,
      'round_name', r.name,
      'nf_name', nf.nf_name
    ) order by e.edition_number desc nulls last, s.country)
    from public.submissions s
    join public.editions e on e.id=s.edition_id
    join public.submission_rounds r on r.id=s.round_id
    left join public.national_finals nf on nf.submission_id=s.id
    where (_edition_id is null or s.edition_id=_edition_id)
      and (_round_id is null or s.round_id=_round_id)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_confirmation_recovery_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'country', s.country,
      'instagram_username', s.instagram_username,
      'recovery_code', s.recovery_code,
      'submitted_at', s.submitted_at,
      'round_id', s.round_id,
      'round_name', r.name,
      'edition_id', s.edition_id,
      'edition_name', e.name,
      'edition_number', e.edition_number
    ) order by s.submitted_at desc)
    from public.submissions s
    join public.submission_rounds r on r.id=s.round_id
    join public.editions e on e.id=s.edition_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_confirmation_responses()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(item order by submitted_at desc)
    from (
      select
        s.submitted_at,
        jsonb_build_object(
          'id', s.id,
          'country', s.country,
          'instagram_username', s.instagram_username,
          'participating', s.participating,
          'selection_method', s.selection_method,
          'entry_unknown', s.entry_unknown,
          'nf_entries_unknown', s.nf_entries_unknown,
          'reveal_date_type', s.reveal_date_type,
          'reveal_exact_date', s.reveal_exact_date,
          'reveal_approximate_text', s.reveal_approximate_text,
          'nf_date_type', s.nf_date_type,
          'nf_exact_date', s.nf_exact_date,
          'nf_approximate_text', s.nf_approximate_text,
          'nf_result_date_type', s.nf_result_date_type,
          'nf_result_exact_date', s.nf_result_exact_date,
          'nf_result_approximate_text', s.nf_result_approximate_text,
          'reviewed', s.reviewed,
          'locked', s.locked,
          'editing_allowed', s.editing_allowed,
          'submitted_at', s.submitted_at,
          'updated_at', s.updated_at,
          'submission_rounds', jsonb_build_object('id', r.id, 'name', r.name, 'edition_id', r.edition_id),
          'editions', jsonb_build_object('id', e.id, 'name', e.name, 'edition_number', e.edition_number),
          'internal_entries', (
            select jsonb_build_object(
              'id', i.id, 'artist', i.artist, 'song_title', i.song_title, 'song_url', i.song_url,
              'review_status', i.review_status, 'review_reason', i.review_reason, 'reviewed_at', i.reviewed_at,
              'preview_start', i.preview_start, 'preview_end', i.preview_end,
              'final_clip_start', i.final_clip_start, 'final_clip_end', i.final_clip_end,
              'replacement_video_required', i.replacement_video_required,
              'replacement_video_url', i.replacement_video_url
            )
            from public.internal_entries i where i.submission_id=s.id limit 1
          ),
          'national_finals', (
            select jsonb_build_object(
              'id', nf.id,
              'nf_name', nf.nf_name,
              'expected_entry_count', nf.expected_entry_count,
              'winning_entry_id', nf.winning_entry_id,
              'national_final_entries', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', nfe.id, 'artist', nfe.artist, 'song_title', nfe.song_title, 'song_url', nfe.song_url,
                  'review_status', nfe.review_status, 'review_reason', nfe.review_reason, 'reviewed_at', nfe.reviewed_at,
                  'removed', nfe.removed, 'position', nfe.position,
                  'preview_start', nfe.preview_start, 'preview_end', nfe.preview_end,
                  'final_clip_start', nfe.final_clip_start, 'final_clip_end', nfe.final_clip_end,
                  'replacement_video_required', nfe.replacement_video_required,
                  'replacement_video_url', nfe.replacement_video_url
                ) order by nfe.position)
                from public.national_final_entries nfe where nfe.national_final_id=nf.id
              ), '[]'::jsonb)
            )
            from public.national_finals nf where nf.submission_id=s.id limit 1
          )
        ) item
      from public.submissions s
      join public.submission_rounds r on r.id=s.round_id
      join public.editions e on e.id=s.edition_id
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_confirmation_response(_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result jsonb;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'country', s.country,
    'instagram_username', s.instagram_username,
    'country_account', s.country_account,
    'has_country_account', s.has_country_account,
    'participating', s.participating,
    'selection_method', s.selection_method,
    'entry_unknown', s.entry_unknown,
    'nf_entries_unknown', s.nf_entries_unknown,
    'reveal_date_type', s.reveal_date_type,
    'reveal_exact_date', s.reveal_exact_date,
    'reveal_approximate_text', s.reveal_approximate_text,
    'nf_date_type', s.nf_date_type,
    'nf_exact_date', s.nf_exact_date,
    'nf_approximate_text', s.nf_approximate_text,
    'nf_result_date_type', s.nf_result_date_type,
    'nf_result_exact_date', s.nf_result_exact_date,
    'nf_result_approximate_text', s.nf_result_approximate_text,
    'editing_allowed', s.editing_allowed,
    'locked', s.locked,
    'reviewed', s.reviewed,
    'admin_notes', s.admin_notes,
    'edit_count', s.edit_count,
    'submitted_at', s.submitted_at,
    'updated_at', s.updated_at,
    'round', jsonb_build_object('id', r.id, 'name', r.name),
    'edition', jsonb_build_object('id', e.id, 'name', e.name, 'edition_number', e.edition_number),
    'internal_entry', (
      select jsonb_build_object(
        'id', i.id, 'artist', i.artist, 'song_title', i.song_title, 'song_url', i.song_url,
        'review_status', i.review_status, 'review_reason', i.review_reason, 'reviewed_at', i.reviewed_at,
        'preview_start', i.preview_start, 'preview_end', i.preview_end,
        'final_clip_start', i.final_clip_start, 'final_clip_end', i.final_clip_end,
        'replacement_video_required', i.replacement_video_required,
        'replacement_video_url', i.replacement_video_url
      ) from public.internal_entries i where i.submission_id=s.id limit 1
    ),
    'national_final', (
      select jsonb_build_object(
        'id', nf.id, 'nf_name', nf.nf_name, 'expected_entry_count', nf.expected_entry_count,
        'winning_entry_id', nf.winning_entry_id,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', nfe.id, 'artist', nfe.artist, 'song_title', nfe.song_title, 'song_url', nfe.song_url,
            'review_status', nfe.review_status, 'review_reason', nfe.review_reason, 'reviewed_at', nfe.reviewed_at,
            'removed', nfe.removed, 'position', nfe.position,
            'preview_start', nfe.preview_start, 'preview_end', nfe.preview_end,
            'final_clip_start', nfe.final_clip_start, 'final_clip_end', nfe.final_clip_end,
            'replacement_video_required', nfe.replacement_video_required,
            'replacement_video_url', nfe.replacement_video_url
          ) order by nfe.position)
          from public.national_final_entries nfe where nfe.national_final_id=nf.id
        ), '[]'::jsonb)
      ) from public.national_finals nf where nf.submission_id=s.id limit 1
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'target_type', h.target_type,
        'target_entry_id', h.target_entry_id,
        'artist', h.artist_snapshot,
        'song_title', h.song_title_snapshot,
        'action', h.action,
        'reason', h.reason,
        'created_at', h.created_at
      ) order by h.created_at desc)
      from public.submission_review_history h where h.submission_id=s.id
    ), '[]'::jsonb)
  )
  into result
  from public.submissions s
  join public.submission_rounds r on r.id=s.round_id
  join public.editions e on e.id=s.edition_id
  where s.id=_submission_id;

  if result is null then raise exception 'Submission not found' using errcode='22023'; end if;
  return result;
end;
$$;

create or replace function public.admin_review_confirmation_entry(
  _target_type text,
  _entry_id uuid,
  _status text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_submission_id uuid;
  v_nf_id uuid;
  v_artist text;
  v_song text;
  v_removed boolean := false;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if _target_type not in ('internal','national_final') then
    raise exception 'Invalid entry target' using errcode='22023';
  end if;
  if _status not in ('pending','accepted','declined','removed') then
    raise exception 'Invalid review status' using errcode='22023';
  end if;
  if _status not in ('accepted','pending') and nullif(btrim(coalesce(_reason,'')), '') is null then
    raise exception 'A review reason is required' using errcode='22023';
  end if;

  if _target_type='internal' then
    select i.submission_id,i.artist,i.song_title into v_submission_id,v_artist,v_song
    from public.internal_entries i where i.id=_entry_id for update;
    if v_submission_id is null then raise exception 'Entry not found' using errcode='22023'; end if;
    update public.internal_entries
    set review_status=case when _status='removed' then 'declined' else _status end,
        review_reason=nullif(btrim(coalesce(_reason,'')), ''),
        reviewed_at=now(),
        reviewed_by=auth.uid()
    where id=_entry_id;
  else
    select nf.submission_id,nf.id,nfe.artist,nfe.song_title
      into v_submission_id,v_nf_id,v_artist,v_song
    from public.national_final_entries nfe
    join public.national_finals nf on nf.id=nfe.national_final_id
    where nfe.id=_entry_id for update of nfe;
    if v_submission_id is null then raise exception 'Entry not found' using errcode='22023'; end if;

    v_removed := _status='removed';
    update public.national_final_entries
    set review_status=_status,
        review_reason=nullif(btrim(coalesce(_reason,'')), ''),
        reviewed_at=now(),
        reviewed_by=auth.uid(),
        removed=v_removed,
        removed_at=case when v_removed then now() else null end
    where id=_entry_id;

    if v_removed then
      update public.national_finals set winning_entry_id=null
      where id=v_nf_id and winning_entry_id=_entry_id;
    end if;
  end if;

  insert into public.submission_review_history(
    submission_id,target_type,target_entry_id,artist_snapshot,song_title_snapshot,action,reason,admin_user_id
  ) values (
    v_submission_id,_target_type,_entry_id,v_artist,v_song,_status,
    nullif(btrim(coalesce(_reason,'')), ''),auth.uid()
  );

  update public.submissions
  set reviewed = not exists (
    select 1 from public.internal_entries i
    where i.submission_id=v_submission_id and i.review_status='pending'
  ) and not exists (
    select 1
    from public.national_finals nf
    join public.national_final_entries nfe on nfe.national_final_id=nf.id
    where nf.submission_id=v_submission_id
      and coalesce(nfe.removed,false)=false
      and nfe.review_status='pending'
  )
  where id=v_submission_id;

  return jsonb_build_object('ok',true,'submission_id',v_submission_id);
end;
$$;

create or replace function public.admin_update_confirmation_controls(
  _submission_id uuid,
  _editing_allowed boolean,
  _locked boolean,
  _admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  update public.submissions
  set editing_allowed=_editing_allowed,
      locked=_locked,
      admin_notes=nullif(btrim(coalesce(_admin_notes,'')), ''),
      updated_at=now()
  where id=_submission_id;
  if not found then raise exception 'Submission not found' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.admin_set_confirmation_winner(
  _national_final_id uuid,
  _entry_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_submission_id uuid;
  v_artist text;
  v_song text;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(_reason,'')), '') is null then
    raise exception 'A reason is required' using errcode='22023';
  end if;

  select nf.submission_id,nfe.artist,nfe.song_title
    into v_submission_id,v_artist,v_song
  from public.national_finals nf
  join public.national_final_entries nfe
    on nfe.national_final_id=nf.id
   and nfe.id=_entry_id
   and coalesce(nfe.removed,false)=false
   and nfe.review_status='accepted'
  where nf.id=_national_final_id
  for update of nf;

  if v_submission_id is null then
    raise exception 'Winner must be an accepted active entry from this National Final' using errcode='22023';
  end if;

  update public.national_finals set winning_entry_id=_entry_id where id=_national_final_id;
  insert into public.submission_review_history(
    submission_id,target_type,target_entry_id,artist_snapshot,song_title_snapshot,action,reason,admin_user_id
  ) values (
    v_submission_id,'national_final',_entry_id,v_artist,v_song,'winner_selected',btrim(_reason),auth.uid()
  );
  return jsonb_build_object('ok',true,'submission_id',v_submission_id,'winning_entry_id',_entry_id);
end;
$$;

create or replace function public.admin_clear_confirmation_winner(
  _national_final_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_submission_id uuid;
  v_entry_id uuid;
  v_artist text;
  v_song text;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if nullif(btrim(coalesce(_reason,'')), '') is null then
    raise exception 'A reason is required' using errcode='22023';
  end if;

  select nf.submission_id,nf.winning_entry_id,nfe.artist,nfe.song_title
    into v_submission_id,v_entry_id,v_artist,v_song
  from public.national_finals nf
  left join public.national_final_entries nfe on nfe.id=nf.winning_entry_id
  where nf.id=_national_final_id
  for update of nf;

  if v_submission_id is null then raise exception 'National Final not found' using errcode='22023'; end if;
  if v_entry_id is null then raise exception 'No winner is currently selected' using errcode='22023'; end if;

  update public.national_finals set winning_entry_id=null where id=_national_final_id;
  insert into public.submission_review_history(
    submission_id,target_type,target_entry_id,artist_snapshot,song_title_snapshot,action,reason,admin_user_id
  ) values (
    v_submission_id,'national_final',v_entry_id,v_artist,v_song,'winner_cleared',btrim(_reason),auth.uid()
  );
  return jsonb_build_object('ok',true,'submission_id',v_submission_id);
end;
$$;

create or replace function public.admin_confirmation_technical(_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if not exists(select 1 from public.submissions where id=_submission_id) then
    raise exception 'Submission not found' using errcode='22023';
  end if;
  return jsonb_build_object(
    'ip_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',h.id,'ip_address',h.ip_address,'first_seen_at',h.first_seen_at,'last_seen_at',h.last_seen_at
      ) order by h.last_seen_at desc)
      from public.submission_ip_history h where h.submission_id=_submission_id
    ), '[]'::jsonb),
    'tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'token_type',t.token_type,'active',t.active,'created_at',t.created_at,
        'expires_at',t.expires_at,'last_used_at',t.last_used_at,'use_count',t.use_count
      ) order by t.created_at desc)
      from public.edit_tokens t where t.submission_id=_submission_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_confirmation_create_edit_token(
  _submission_id uuid,
  _token_type text,
  _expires_in_hours integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_token text;
  v_hash text;
  v_expires_at timestamptz;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  if _token_type not in ('one_time','reusable') then raise exception 'Invalid token type' using errcode='22023'; end if;
  if _expires_in_hours is not null and (_expires_in_hours < 1 or _expires_in_hours > 8760) then
    raise exception 'Invalid expiry' using errcode='22023';
  end if;
  if not exists(select 1 from public.submissions where id=_submission_id) then
    raise exception 'Submission not found' using errcode='22023';
  end if;

  update public.edit_tokens set active=false where submission_id=_submission_id and active=true;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  v_expires_at := case when _expires_in_hours is null then null else now()+make_interval(hours=>_expires_in_hours) end;

  insert into public.edit_tokens(submission_id,token_hash,token_type,active,expires_at)
  values(_submission_id,v_hash,_token_type,true,v_expires_at);

  return jsonb_build_object('token',v_token,'token_type',_token_type,'expires_at',v_expires_at);
end;
$$;

create or replace function public.admin_confirmation_revoke_edit_token(_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  update public.edit_tokens set active=false where id=_token_id;
  if not found then raise exception 'Edit token not found' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.admin_confirmation_delete_response(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  delete from public.submissions where id=_submission_id;
  if not found then raise exception 'Submission not found' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.admin_confirmation_next_in_line(_edition_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',n.id,'edition_id',n.edition_id,'source_submission_id',n.source_submission_id,
      'country',n.country,'participating',n.participating,'entry_unknown',n.entry_unknown,
      'selection_type',n.selection_type,'national_final_entry_id',n.national_final_entry_id,
      'artist',n.artist,'song_title',n.song_title,'song_url',n.song_url,
      'preview_start',n.preview_start,'preview_end',n.preview_end,'submitted_at',n.submitted_at,
      'edition',case when e.id is null then null else jsonb_build_object(
        'id',e.id,'name',e.name,'edition_number',e.edition_number
      ) end
    ) order by n.submitted_at desc)
    from public.next_in_line_submissions n
    left join public.editions e on e.id=n.edition_id
    where _edition_id is null or n.edition_id=_edition_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_confirmation_national_final_winner_from_solaris(
  _national_final_id uuid,
  _winning_entry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_nf public.national_finals;
  v_submission public.submissions;
  v_country public.countries;
  v_old_entry public.national_final_entries;
  v_new_entry public.national_final_entries;
  v_admin boolean := false;
  v_country_allowed boolean := false;
begin
  select * into v_nf from public.national_finals where id=_national_final_id for update;
  if v_nf.id is null then raise exception 'National Final not found' using errcode='22023'; end if;

  select * into v_submission from public.submissions where id=v_nf.submission_id;
  if v_submission.id is null then raise exception 'Confirmation submission not found' using errcode='22023'; end if;

  v_admin := private.solaris_confirmation_admin_allowed();

  if auth.uid() is not null then
    select c.* into v_country
    from public.country_accounts ca
    join public.countries c on c.id=ca.country_id
    where ca.user_id=auth.uid() and ca.status='active'
    limit 1;

    if v_country.id is not null then
      v_country_allowed :=
        lower(btrim(v_submission.country)) in (
          lower(btrim(v_country.name)),
          lower(btrim(v_country.short_code))
        );
    end if;
  end if;

  if not (v_admin or v_country_allowed) then
    raise exception 'You cannot edit this confirmation National Final' using errcode='42501';
  end if;

  if v_nf.winning_entry_id is not null then
    select * into v_old_entry from public.national_final_entries
    where id=v_nf.winning_entry_id and national_final_id=v_nf.id;
  end if;

  if _winning_entry_id is not null then
    select * into v_new_entry from public.national_final_entries
    where id=_winning_entry_id
      and national_final_id=v_nf.id
      and coalesce(removed,false)=false
      and review_status='accepted';
    if v_new_entry.id is null then
      raise exception 'Winner must be an accepted active entry from this National Final' using errcode='22023';
    end if;
  end if;

  update public.national_finals set winning_entry_id=_winning_entry_id where id=v_nf.id;

  if v_nf.winning_entry_id is distinct from _winning_entry_id then
    insert into public.submission_review_history(
      submission_id,target_type,target_entry_id,artist_snapshot,song_title_snapshot,action,reason,admin_user_id
    ) values (
      v_nf.submission_id,'national_final',coalesce(v_new_entry.id,v_old_entry.id),
      coalesce(v_new_entry.artist,v_old_entry.artist),coalesce(v_new_entry.song_title,v_old_entry.song_title),
      case when _winning_entry_id is null then 'winner_cleared' else 'winner_selected' end,
      'Winner synced from MySolaris',case when v_admin then auth.uid() else null end
    );
  end if;

  return jsonb_build_object(
    'ok',true,'national_final_id',v_nf.id,'submission_id',v_nf.submission_id,'winning_entry_id',_winning_entry_id
  );
end;
$$;

-- All organizer compatibility RPCs are authenticated-only. The service role is
-- retained for migration/operations. Anonymous clients must never receive the
-- organizer contract even if a future default EXECUTE grant changes.


-- Port version history RPCs from the former dedicated Confirmations project.

-- Applied to the dedicated Confirmations Supabase project.
-- Exposes read-only submission version history to Solaris organizers through
-- the existing cross-project organizer identity bridge. Raw legacy snapshots
-- contain IP/session/recovery fields, so the detail RPC whitelists only
-- contest-operational fields before any payload reaches the browser.

create or replace function public.admin_confirmation_version_summary()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Forbidden';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'submission_id', q.submission_id,
        'version_count', q.version_count,
        'latest_created_at', q.latest_created_at
      )
      order by q.latest_created_at desc
    )
    from (
      select
        v.submission_id,
        count(*)::integer as version_count,
        max(v.created_at) as latest_created_at
      from public.submission_versions v
      group by v.submission_id
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_confirmation_versions(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
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

revoke all on function public.admin_confirmation_version_summary() from public;
revoke all on function public.admin_confirmation_versions(uuid) from public;

grant execute on function public.admin_confirmation_version_summary() to authenticated, service_role;
grant execute on function public.admin_confirmation_versions(uuid) to authenticated, service_role;


-- Port immutable submission-version restore semantics.

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
using (private.solaris_confirmation_admin_allowed());

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
  native_admin := private.solaris_confirmation_admin_allowed();
  if not native_admin then
    solaris_admin := private.solaris_confirmation_admin_allowed();
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
  to authenticated, service_role;

-- Extend the safe read RPC with provenance metadata. Raw snapshots remain
-- server-side whitelisted exactly as before.
create or replace function public.admin_confirmation_versions(_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not private.solaris_confirmation_admin_allowed() then
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
  to authenticated, service_role;


-- Preserve round-first locking and moderation safety for restores.

-- Applied immediately after confirmations-submission-version-restore.sql.
-- Ordinary confirmation edits lock submission_rounds first. Keep organizer
-- restores on the same lock order so a simultaneous edit/restore cannot race
-- version allocation or deadlock on opposite row-lock ordering.

-- The live legacy project used a broad authenticated ALL policy named
-- "versions admin". Direct writes are already blocked by table grants after the
-- first restore migration, but remove the broad policy as well so history is
-- unambiguously select-only for direct authenticated table access.
drop policy if exists "versions admin" on public.submission_versions;

alter function public.admin_restore_confirmation_version(uuid, uuid, text)
  rename to admin_restore_confirmation_version_apply;

revoke all on function public.admin_restore_confirmation_version_apply(uuid, uuid, text)
  from public, anon, authenticated, service_role;

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
  target_round_id uuid;
  native_admin boolean := false;
  solaris_admin boolean := false;
begin
  native_admin := private.solaris_confirmation_admin_allowed();
  if not native_admin then
    solaris_admin := private.solaris_confirmation_admin_allowed();
  end if;
  if not (native_admin or solaris_admin) then
    raise exception 'Forbidden';
  end if;

  if nullif(btrim(coalesce(_reason, '')), '') is null then
    raise exception 'Restore reason is required';
  end if;

  select s.round_id
  into target_round_id
  from public.submissions s
  where s.id = _submission_id;

  if target_round_id is null then
    raise exception 'Submission not found';
  end if;

  -- Match submit_confirmation(): round first, then submission inside the helper.
  perform 1
  from public.submission_rounds r
  where r.id = target_round_id
  for update;

  -- A historical delegation snapshot must never bypass a later organizer
  -- moderation removal. If a target NF contains an entry that currently exists
  -- only as a removed moderation record, require manual organizer resolution
  -- rather than silently recreating it as a new active row.
  if exists (
    select 1
    from public.submission_versions v
    join public.national_finals nf
      on nf.submission_id = _submission_id
    join public.national_final_entries removed_entry
      on removed_entry.national_final_id = nf.id
     and coalesce(removed_entry.removed, false) = true
    where v.id = _version_id
      and v.submission_id = _submission_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(v.snapshot -> 'nf_entries') = 'array'
              then v.snapshot -> 'nf_entries'
            else '[]'::jsonb
          end
        ) historical_entry
        where coalesce((historical_entry ->> 'removed')::boolean, false) = false
          and public.normalize_entry_text(historical_entry ->> 'artist')
              = public.normalize_entry_text(removed_entry.artist)
          and public.normalize_entry_text(historical_entry ->> 'song_title')
              = public.normalize_entry_text(removed_entry.song_title)
      )
  ) then
    raise exception 'Restore blocked: the historical snapshot contains a National Final entry removed by organizer moderation';
  end if;

  return public.admin_restore_confirmation_version_apply(
    _submission_id,
    _version_id,
    _reason
  );
end;
$$;

revoke all on function public.admin_restore_confirmation_version(uuid, uuid, text)
  from public;
grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)
  to authenticated, service_role;



do $grant$
declare
  rec record;
begin
  for rec in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (
        p.proname like 'admin_confirmation_%'
        or p.proname='admin_review_confirmation_entry'
        or p.proname='admin_update_confirmation_controls'
        or p.proname='admin_set_confirmation_winner'
        or p.proname='admin_clear_confirmation_winner'
        or p.proname='admin_restore_confirmation_version'
        or p.proname='set_confirmation_national_final_winner_from_solaris'
      )
  loop
    execute format('revoke all on function %s from public, anon', rec.signature);
    execute format('grant execute on function %s to authenticated, service_role', rec.signature);
  end loop;
end
$grant$;
