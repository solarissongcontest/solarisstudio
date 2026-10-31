begin;

-- System V3 / O4: recovery codes are credential-like data. Current-edition
-- Organizer Recovery Access must never download every edition's recovery
-- credentials and rely on browser filtering. Keep the legacy RPC for rollout
-- compatibility while exposing a bounded exact-edition successor.
--
-- S13 contract: additive forward fix only. No destructive DDL and no backfill.
select public.v3_register_migration_contract(
  '20261019212100_v3_confirmation_recovery_projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Exact-edition bounded Organizer Confirmation recovery-access projection'
);

create or replace function public.admin_confirmation_recovery_codes_v2(
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
as $recovery_v2$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_submitted_at timestamptz;
  v_next_submission_id uuid;
  v_total_count bigint := 0;
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

  select count(*)::bigint
  into v_total_count
  from public.submissions submission
  where submission.edition_id = p_edition_id
    and submission.recovery_code is not null;

  with candidate as (
    select submission.id, submission.submitted_at
    from public.submissions submission
    where submission.edition_id = p_edition_id
      and submission.recovery_code is not null
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
      'recovery_code', submission.recovery_code,
      'submitted_at', submission.submitted_at,
      'round_id', round.id,
      'round_name', round.name,
      'edition_id', edition.id,
      'edition_name', edition.name,
      'edition_number', edition.edition_number
    )
    order by submission.submitted_at desc, submission.id desc
  ), '[]'::jsonb)
  into v_rows
  from visible page
  join public.submissions submission on submission.id = page.id
  join public.submission_rounds round on round.id = submission.round_id
  join public.editions edition on edition.id = submission.edition_id;

  with candidate as (
    select submission.id, submission.submitted_at
    from public.submissions submission
    where submission.edition_id = p_edition_id
      and submission.recovery_code is not null
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
        and submission.recovery_code is not null
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
    'serverTime', now()
  );
end
$recovery_v2$;

comment on function public.admin_confirmation_recovery_codes_v2(uuid, integer, timestamptz, uuid)
is 'Sensitive exact-edition bounded Organizer Confirmation recovery-code projection. Never use a global/current-edition fallback.';

revoke all on function public.admin_confirmation_recovery_codes_v2(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_confirmation_recovery_codes_v2(uuid, integer, timestamptz, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
