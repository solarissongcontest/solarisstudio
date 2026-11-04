begin;

-- S15 forward-only, read-only response-version summary for exact Organizer
-- edition. Existing admin_confirmation_version_summary() intentionally remains
-- untouched for legacy compatibility; new V3 consumers MUST NOT call it.
-- Never expose full immutable snapshots through this list projection.
select public.v3_register_migration_contract(
  'v3.organizer.confirmation-history-summary-scope',
  1,
  'forward_fix_only',
  false,
  null,
  'Authorize bounded Confirmation version summaries for exact-edition submission ids'
);

create or replace function public.admin_confirmation_version_summary_v2(
  p_edition_id uuid,
  p_submission_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $summary$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_submission_ids is null
     or cardinality(p_submission_ids) > 200 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not exists (
    select 1 from public.editions edition where edition.id = p_edition_id
  ) then
    raise exception using errcode = 'P0002', message = 'EDITION_NOT_FOUND';
  end if;
  if private.solaris_confirmation_admin_read_allowed(p_edition_id, false)
     is distinct from true then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  -- Refuse mixed-edition, nonexistent or NULL ids rather than silently
  -- stripping them and letting a browser infer what other editions contain.
  if exists (
    select 1
    from unnest(p_submission_ids) as requested(id)
    left join public.submissions submission
      on submission.id = requested.id
     and submission.edition_id = p_edition_id
    where requested.id is null or submission.id is null
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SUBMISSION_SCOPE';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submission_id', summary.submission_id,
        'version_count', summary.version_count,
        'latest_created_at', summary.latest_created_at
      )
      order by summary.latest_created_at desc, summary.submission_id desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select version.submission_id,
           count(*)::integer as version_count,
           max(version.created_at) as latest_created_at
    from public.submission_versions version
    join public.submissions submission
      on submission.id = version.submission_id
     and submission.edition_id = p_edition_id
    where version.submission_id = any(p_submission_ids)
    group by version.submission_id
  ) summary;

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionId', p_edition_id,
    'rows', v_rows,
    'serverTime', now()
  );
end
$summary$;

comment on function public.admin_confirmation_version_summary_v2(uuid, uuid[])
is 'Bounded, exact-edition Confirmation version counts only; no raw snapshots or global edition fallback.';

revoke all on function public.admin_confirmation_version_summary_v2(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.admin_confirmation_version_summary_v2(uuid, uuid[])
  to authenticated;

notify pgrst, 'reload schema';

commit;
