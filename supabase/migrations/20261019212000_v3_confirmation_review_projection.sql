begin;

-- System V3 / O4-O5: current-edition Organizer review must not download the
-- all-editions Confirmation response archive and filter it in the browser.
-- This additive projection preserves the existing response payload shape while
-- adding exact edition authorization, bounded keyset paging and current review
-- revision identity needed for stale-state reconciliation.
--
-- S13 contract: additive forward fix only. No destructive DDL and no backfill.
select public.v3_register_migration_contract(
  '20261019212000_v3_confirmation_review_projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Exact-edition bounded Organizer Confirmation and Entry Review projection'
);

create or replace function public.admin_confirmation_responses_v2(
  p_edition_id uuid,
  p_limit integer default 100,
  p_before_submitted_at timestamptz default null,
  p_before_submission_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $responses_v2$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_submitted_at timestamptz;
  v_next_submission_id uuid;
  v_total_count bigint := 0;
  v_latest_update timestamptz;
  v_review_version_sum numeric := 0;
  v_state_version text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if (p_before_submitted_at is null) is distinct from (p_before_submission_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;
  if not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;
  if not private.solaris_confirmation_admin_read_allowed(p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  select
    count(*)::bigint,
    max(submission.updated_at),
    coalesce(sum(coalesce(review_version.version, 1)), 0)::numeric
  into v_total_count, v_latest_update, v_review_version_sum
  from public.submissions submission
  left join public.studio2_confirmation_review_versions review_version
    on review_version.submission_id = submission.id
  where submission.edition_id = p_edition_id;

  v_state_version := concat_ws(
    ':',
    p_edition_id::text,
    v_total_count::text,
    coalesce(extract(epoch from v_latest_update)::text, '0'),
    v_review_version_sum::text
  );

  with candidate as (
    select submission.id, submission.submitted_at
    from public.submissions submission
    where submission.edition_id = p_edition_id
      and (
        p_before_submitted_at is null
        or (submission.submitted_at, submission.id)
           < (p_before_submitted_at, p_before_submission_id)
      )
    order by submission.submitted_at desc, submission.id desc
    limit v_limit + 1
  ),
  visible as (
    select candidate.id, candidate.submitted_at
    from candidate
    order by candidate.submitted_at desc, candidate.id desc
    limit v_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', submission.id,
      'country', submission.country,
      'instagram_username', submission.instagram_username,
      'participating', submission.participating,
      'selection_method', submission.selection_method,
      'entry_unknown', submission.entry_unknown,
      'nf_entries_unknown', submission.nf_entries_unknown,
      'reveal_date_type', submission.reveal_date_type,
      'reveal_exact_date', submission.reveal_exact_date,
      'reveal_approximate_text', submission.reveal_approximate_text,
      'nf_date_type', submission.nf_date_type,
      'nf_exact_date', submission.nf_exact_date,
      'nf_approximate_text', submission.nf_approximate_text,
      'nf_result_date_type', submission.nf_result_date_type,
      'nf_result_exact_date', submission.nf_result_exact_date,
      'nf_result_approximate_text', submission.nf_result_approximate_text,
      'reviewed', submission.reviewed,
      'locked', submission.locked,
      'editing_allowed', submission.editing_allowed,
      'submitted_at', submission.submitted_at,
      'updated_at', submission.updated_at,
      'review_version', coalesce(review_version.version, 1),
      'submission_rounds', jsonb_build_object(
        'id', round.id,
        'name', round.name,
        'edition_id', round.edition_id
      ),
      'editions', jsonb_build_object(
        'id', edition.id,
        'name', edition.name,
        'edition_number', edition.edition_number
      ),
      'internal_entries', (
        select jsonb_build_object(
          'id', internal_entry.id,
          'artist', internal_entry.artist,
          'song_title', internal_entry.song_title,
          'song_url', internal_entry.song_url,
          'review_status', internal_entry.review_status,
          'review_reason', internal_entry.review_reason,
          'reviewed_at', internal_entry.reviewed_at,
          'preview_start', internal_entry.preview_start,
          'preview_end', internal_entry.preview_end,
          'final_clip_start', internal_entry.final_clip_start,
          'final_clip_end', internal_entry.final_clip_end,
          'replacement_video_required', internal_entry.replacement_video_required,
          'replacement_video_url', internal_entry.replacement_video_url,
          'current_version_id', internal_entry.current_version_id,
          'reviewed_version_id', internal_entry.reviewed_version_id,
          'content_revision', internal_entry.content_revision
        )
        from public.internal_entries internal_entry
        where internal_entry.submission_id = submission.id
        limit 1
      ),
      'national_finals', (
        select jsonb_build_object(
          'id', national_final.id,
          'nf_name', national_final.nf_name,
          'expected_entry_count', national_final.expected_entry_count,
          'winning_entry_id', national_final.winning_entry_id,
          'national_final_entries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', nf_entry.id,
                'artist', nf_entry.artist,
                'song_title', nf_entry.song_title,
                'song_url', nf_entry.song_url,
                'review_status', nf_entry.review_status,
                'review_reason', nf_entry.review_reason,
                'reviewed_at', nf_entry.reviewed_at,
                'removed', nf_entry.removed,
                'position', nf_entry.position,
                'preview_start', nf_entry.preview_start,
                'preview_end', nf_entry.preview_end,
                'final_clip_start', nf_entry.final_clip_start,
                'final_clip_end', nf_entry.final_clip_end,
                'replacement_video_required', nf_entry.replacement_video_required,
                'replacement_video_url', nf_entry.replacement_video_url,
                'current_version_id', nf_entry.current_version_id,
                'reviewed_version_id', nf_entry.reviewed_version_id,
                'content_revision', nf_entry.content_revision
              )
              order by nf_entry.position, nf_entry.id
            )
            from public.national_final_entries nf_entry
            where nf_entry.national_final_id = national_final.id
          ), '[]'::jsonb)
        )
        from public.national_finals national_final
        where national_final.submission_id = submission.id
        limit 1
      )
    )
    order by submission.submitted_at desc, submission.id desc
  ), '[]'::jsonb)
  into v_rows
  from visible page
  join public.submissions submission on submission.id = page.id
  join public.submission_rounds round on round.id = submission.round_id
  join public.editions edition on edition.id = submission.edition_id
  left join public.studio2_confirmation_review_versions review_version
    on review_version.submission_id = submission.id;

  with candidate as (
    select submission.id, submission.submitted_at
    from public.submissions submission
    where submission.edition_id = p_edition_id
      and (
        p_before_submitted_at is null
        or (submission.submitted_at, submission.id)
           < (p_before_submitted_at, p_before_submission_id)
      )
    order by submission.submitted_at desc, submission.id desc
    limit v_limit + 1
  )
  select count(*) > v_limit
  into v_has_more
  from candidate;

  if v_has_more and jsonb_array_length(v_rows) > 0 then
    with candidate as (
      select submission.id, submission.submitted_at
      from public.submissions submission
      where submission.edition_id = p_edition_id
        and (
          p_before_submitted_at is null
          or (submission.submitted_at, submission.id)
             < (p_before_submitted_at, p_before_submission_id)
        )
      order by submission.submitted_at desc, submission.id desc
      limit v_limit
    )
    select candidate.submitted_at, candidate.id
    into v_next_submitted_at, v_next_submission_id
    from candidate
    order by candidate.submitted_at asc, candidate.id asc
    limit 1;
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionId', p_edition_id,
    'rows', v_rows,
    'page', jsonb_build_object(
      'limit', v_limit,
      'hasMore', v_has_more,
      'nextCursor', case
        when v_has_more then jsonb_build_object(
          'submittedAt', v_next_submitted_at,
          'submissionId', v_next_submission_id
        )
        else null
      end
    ),
    'totalCount', v_total_count,
    'stateVersion', v_state_version,
    'serverTime', now()
  );
end
$responses_v2$;

comment on function public.admin_confirmation_responses_v2(uuid, integer, timestamptz, uuid)
is 'Exact-edition, bounded Organizer Confirmation/Entry Review projection with immutable Entry version identity.';

revoke all on function public.admin_confirmation_responses_v2(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_confirmation_responses_v2(uuid, integer, timestamptz, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
