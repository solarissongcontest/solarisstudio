begin;

-- V3 O4/O5 read-scope hardening.
--
-- The legacy Confirmation admin RPCs intentionally remain available during the
-- compatibility window. New V3 Organizer consumers must use these exact-edition
-- projections so historical response, technical and recovery data is never
-- fetched into the browser merely to be filtered there.
select public.v3_register_migration_contract(
  '20261020001500_confirmation_exact_edition_reads',
  1,
  'forward_fix_only',
  false,
  null,
  'O4/O5 exact-edition Confirmation response, detail, technical and recovery read projections'
);

create index if not exists submissions_edition_submitted_idx
  on public.submissions (edition_id, submitted_at desc, id);

create or replace function public.admin_confirmation_responses_for_edition(
  _edition_id uuid,
  _limit integer default 100,
  _offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_latest_change timestamptz;
begin
  if _edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;
  if _limit is null or _limit < 1 or _limit > 200 then
    raise exception 'Response page limit must be between 1 and 200' using errcode = '22023';
  end if;
  if _offset is null or _offset < 0 or _offset > 10000 then
    raise exception 'Response page offset must be between 0 and 10000' using errcode = '22023';
  end if;
  if not private.solaris_confirmation_admin_read_allowed(_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.read' using errcode = '42501';
  end if;
  if not exists (select 1 from public.editions e where e.id = _edition_id) then
    raise exception 'Edition not found' using errcode = '22023';
  end if;

  select count(*)::integer, max(s.updated_at)
    into v_total, v_latest_change
  from public.submissions s
  where s.edition_id = _edition_id;

  select coalesce(jsonb_agg(q.item order by q.submitted_at desc, q.id), '[]'::jsonb)
    into v_items
  from (
    select
      s.id,
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
        'edit_count', s.edit_count,
        'submitted_at', s.submitted_at,
        'updated_at', s.updated_at,
        'submission_rounds', jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'edition_id', r.edition_id
        ),
        'editions', jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'edition_number', e.edition_number
        ),
        'internal_entries', (
          select jsonb_build_object(
            'id', i.id,
            'artist', i.artist,
            'song_title', i.song_title,
            'song_url', i.song_url,
            'review_status', i.review_status,
            'review_reason', i.review_reason,
            'reviewed_at', i.reviewed_at,
            'content_revision', i.content_revision,
            'current_version_id', i.current_version_id,
            'reviewed_version_id', i.reviewed_version_id,
            'preview_start', i.preview_start,
            'preview_end', i.preview_end,
            'final_clip_start', i.final_clip_start,
            'final_clip_end', i.final_clip_end,
            'replacement_video_required', i.replacement_video_required,
            'replacement_video_url', i.replacement_video_url
          )
          from public.internal_entries i
          where i.submission_id = s.id
          limit 1
        ),
        'national_finals', (
          select jsonb_build_object(
            'id', nf.id,
            'nf_name', nf.nf_name,
            'expected_entry_count', nf.expected_entry_count,
            'winning_entry_id', nf.winning_entry_id,
            'national_final_entries', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', nfe.id,
                'artist', nfe.artist,
                'song_title', nfe.song_title,
                'song_url', nfe.song_url,
                'review_status', nfe.review_status,
                'review_reason', nfe.review_reason,
                'reviewed_at', nfe.reviewed_at,
                'content_revision', nfe.content_revision,
                'current_version_id', nfe.current_version_id,
                'reviewed_version_id', nfe.reviewed_version_id,
                'removed', nfe.removed,
                'position', nfe.position,
                'preview_start', nfe.preview_start,
                'preview_end', nfe.preview_end,
                'final_clip_start', nfe.final_clip_start,
                'final_clip_end', nfe.final_clip_end,
                'replacement_video_required', nfe.replacement_video_required,
                'replacement_video_url', nfe.replacement_video_url
              ) order by nfe.position)
              from public.national_final_entries nfe
              where nfe.national_final_id = nf.id
            ), '[]'::jsonb)
          )
          from public.national_finals nf
          where nf.submission_id = s.id
          limit 1
        )
      ) as item
    from public.submissions s
    join public.submission_rounds r on r.id = s.round_id
    join public.editions e on e.id = s.edition_id
    where s.edition_id = _edition_id
    order by s.submitted_at desc, s.id
    limit _limit
    offset _offset
  ) q;

  return jsonb_build_object(
    'edition_id', _edition_id,
    'items', v_items,
    'total', v_total,
    'limit', _limit,
    'offset', _offset,
    'has_more', (_offset + jsonb_array_length(v_items)) < v_total,
    'state_version', coalesce(v_latest_change::text, 'empty'),
    'server_time', statement_timestamp()
  );
end;
$function$;

create or replace function public.admin_confirmation_response_for_edition(
  _edition_id uuid,
  _submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
  v_actual_edition_id uuid;
begin
  if _edition_id is null or _submission_id is null then
    raise exception 'Edition and submission are required' using errcode = '22023';
  end if;
  if not private.solaris_confirmation_admin_read_allowed(_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.read' using errcode = '42501';
  end if;

  select s.edition_id
    into v_actual_edition_id
  from public.submissions s
  where s.id = _submission_id;

  if v_actual_edition_id is null or v_actual_edition_id <> _edition_id then
    raise exception 'Submission not found for edition' using errcode = '22023';
  end if;

  v_result := public.admin_confirmation_response(_submission_id);

  -- Defend against a concurrent scope change between the explicit-edition
  -- precheck and the compatibility projection call. No mismatched payload is
  -- returned to the browser even for an operator with access to both editions.
  if (v_result #>> '{edition,id}') is distinct from _edition_id::text then
    raise exception 'Submission scope changed while loading' using errcode = '40001';
  end if;

  return v_result || jsonb_build_object(
    'state_version', coalesce(v_result ->> 'updated_at', 'unknown'),
    'server_time', statement_timestamp()
  );
end;
$function$;

create or replace function public.admin_confirmation_technical_for_edition(
  _edition_id uuid,
  _submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  if _edition_id is null or _submission_id is null then
    raise exception 'Edition and submission are required' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', _edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'edition_id', s.edition_id,
    'submission_id', s.id,
    'ip_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'ip_address', h.ip_address,
        'first_seen_at', h.first_seen_at,
        'last_seen_at', h.last_seen_at
      ) order by h.last_seen_at desc)
      from public.submission_ip_history h
      where h.submission_id = s.id
    ), '[]'::jsonb),
    'tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'token_type', t.token_type,
        'active', t.active,
        'created_at', t.created_at,
        'expires_at', t.expires_at,
        'last_used_at', t.last_used_at,
        'use_count', t.use_count
      ) order by t.created_at desc)
      from public.edit_tokens t
      where t.submission_id = s.id
    ), '[]'::jsonb),
    'server_time', statement_timestamp()
  )
    into v_result
  from public.submissions s
  where s.id = _submission_id
    and s.edition_id = _edition_id;

  if v_result is null then
    raise exception 'Submission not found for edition' using errcode = '22023';
  end if;

  return v_result;
end;
$function$;

create or replace function public.admin_confirmation_recovery_codes_for_edition(
  _edition_id uuid,
  _limit integer default 100,
  _offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if _edition_id is null then
    raise exception 'Edition is required' using errcode = '22023';
  end if;
  if _limit is null or _limit < 1 or _limit > 200 then
    raise exception 'Recovery page limit must be between 1 and 200' using errcode = '22023';
  end if;
  if _offset is null or _offset < 0 or _offset > 10000 then
    raise exception 'Recovery page offset must be between 0 and 10000' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('confirmation.manage', _edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage' using errcode = '42501';
  end if;
  if not exists (select 1 from public.editions e where e.id = _edition_id) then
    raise exception 'Edition not found' using errcode = '22023';
  end if;

  select count(*)::integer
    into v_total
  from public.submissions s
  where s.edition_id = _edition_id;

  select coalesce(jsonb_agg(q.item order by q.submitted_at desc, q.id), '[]'::jsonb)
    into v_items
  from (
    select
      s.id,
      s.submitted_at,
      jsonb_build_object(
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
      ) as item
    from public.submissions s
    join public.submission_rounds r on r.id = s.round_id
    join public.editions e on e.id = s.edition_id
    where s.edition_id = _edition_id
    order by s.submitted_at desc, s.id
    limit _limit
    offset _offset
  ) q;

  return jsonb_build_object(
    'edition_id', _edition_id,
    'items', v_items,
    'total', v_total,
    'limit', _limit,
    'offset', _offset,
    'has_more', (_offset + jsonb_array_length(v_items)) < v_total,
    'server_time', statement_timestamp()
  );
end;
$function$;

revoke all on function public.admin_confirmation_responses_for_edition(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_confirmation_response_for_edition(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_confirmation_technical_for_edition(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_confirmation_recovery_codes_for_edition(uuid, integer, integer) from public, anon, authenticated;

grant execute on function public.admin_confirmation_responses_for_edition(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.admin_confirmation_response_for_edition(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_confirmation_technical_for_edition(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_confirmation_recovery_codes_for_edition(uuid, integer, integer) to authenticated, service_role;

comment on function public.admin_confirmation_responses_for_edition(uuid, integer, integer) is
  'V3 Organizer exact-edition, bounded Confirmation response/review projection. Legacy all-edition RPC remains compatibility-only.';
comment on function public.admin_confirmation_response_for_edition(uuid, uuid) is
  'V3 Organizer response detail projection requiring explicit edition + submission scope.';
comment on function public.admin_confirmation_technical_for_edition(uuid, uuid) is
  'V3 Organizer sensitive technical/token projection requiring explicit edition + submission scope and confirmation.manage.';
comment on function public.admin_confirmation_recovery_codes_for_edition(uuid, integer, integer) is
  'V3 Organizer exact-edition, bounded recovery-code projection. Recovery data remains confirmation.manage-only.';

notify pgrst, 'reload schema';
commit;
