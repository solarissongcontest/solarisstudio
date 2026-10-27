begin;

-- S13 migration contract: additive schema plus an intentional privilege cutover.
-- No bulk backfill is performed. Once the governed submit RPC is deployed the
-- old browser INSERT authority must remain retired, so recovery is forward-only.
select public.v3_register_migration_contract(
  'v3.organizer.admin-beta-acceptance-submission',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern Organizer acceptance evidence through exact-edition authorization, idempotency and operation receipts while retiring direct authenticated INSERT authority.'
);

-- V3 Organizer acceptance evidence is a governed rollout-management command.
-- Keep the historical table as the canonical store, but remove browser INSERT
-- authority and bind every new submission to the exact selected edition and a
-- durable operation receipt.
alter table public.admin_beta_test_submissions
  add column if not exists edition_id uuid references public.editions(id) on delete restrict,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;

create index if not exists admin_beta_test_submissions_edition_created_idx
  on public.admin_beta_test_submissions (edition_id, created_at desc);

revoke insert on table public.admin_beta_test_submissions from authenticated;
drop policy if exists "Organizers can submit admin beta feedback" on public.admin_beta_test_submissions;

create or replace function public.studio2_submit_admin_beta_test(
  p_edition_id uuid,
  p_submission_id uuid,
  p_tester_name text,
  p_device text,
  p_browser text,
  p_familiarity text,
  p_answers jsonb,
  p_bug_reports jsonb,
  p_screenshot_paths text[],
  p_user_agent text,
  p_form_version integer,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $submit$
declare
  v_actor uuid := auth.uid();
  v_tester_name text := btrim(coalesce(p_tester_name, ''));
  v_device text := btrim(coalesce(p_device, ''));
  v_browser text := nullif(btrim(coalesce(p_browser, '')), '');
  v_familiarity text := nullif(btrim(coalesce(p_familiarity, '')), '');
  v_user_agent text := nullif(btrim(coalesce(p_user_agent, '')), '');
  v_paths text[] := coalesce(p_screenshot_paths, '{}'::text[]);
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_result jsonb;
  v_created_at timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_submission_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('rollout.manage', p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if not exists (select 1 from public.editions where id = p_edition_id) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if length(v_tester_name) not between 1 and 120
     or v_device not in ('Phone', 'Tablet', 'Laptop', 'Desktop')
     or p_form_version is null or p_form_version < 1 or p_form_version > 100 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_browser is not null and length(v_browser) > 240
     or v_familiarity is not null and length(v_familiarity) > 240
     or v_user_agent is not null and length(v_user_agent) > 2048 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object'
     or jsonb_typeof(p_bug_reports) is distinct from 'array'
     or pg_column_size(p_answers) > 262144
     or pg_column_size(p_bug_reports) > 262144
     or jsonb_array_length(p_bug_reports) > 50
     or cardinality(v_paths) > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if nullif(p_answers ->> 'organizerEditionId', '') is distinct from p_edition_id::text then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if exists (
    select 1 from unnest(v_paths) path
    where path is null or btrim(path) = '' or length(path) > 1024 or path like '/%' or path like '%..%'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_scope := jsonb_build_object(
    'editionId', p_edition_id,
    'submissionId', p_submission_id
  );
  v_request := jsonb_build_object(
    'testerName', v_tester_name,
    'device', v_device,
    'browser', v_browser,
    'familiarity', v_familiarity,
    'answers', p_answers,
    'bugReports', p_bug_reports,
    'screenshotPaths', to_jsonb(v_paths),
    'userAgent', v_user_agent,
    'formVersion', p_form_version
  );

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'qa.acceptance.submit',
    'R1',
    v_scope,
    v_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded'
       and jsonb_typeof(v_claim -> 'result') = 'object' then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'STATE_CHANGED',
      hint = 'Reconcile the existing operation receipt before retrying.';
  end if;

  insert into public.admin_beta_test_submissions (
    id,
    edition_id,
    submitted_by,
    tester_name,
    device,
    browser,
    familiarity,
    answers,
    bug_reports,
    screenshot_paths,
    user_agent,
    form_version
  ) values (
    p_submission_id,
    p_edition_id,
    v_actor,
    v_tester_name,
    v_device,
    v_browser,
    v_familiarity,
    p_answers,
    p_bug_reports,
    v_paths,
    v_user_agent,
    p_form_version
  )
  returning created_at into v_created_at;

  v_result := jsonb_build_object(
    'ok', true,
    'submissionId', p_submission_id,
    'editionId', p_edition_id,
    'operationId', p_operation_id,
    'createdAt', v_created_at
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$submit$;

revoke all on function public.studio2_submit_admin_beta_test(
  uuid, uuid, text, text, text, text, jsonb, jsonb, text[], text, integer, uuid, text
) from public, anon;
grant execute on function public.studio2_submit_admin_beta_test(
  uuid, uuid, text, text, text, text, jsonb, jsonb, text[], text, integer, uuid, text
) to authenticated, service_role;

comment on function public.studio2_submit_admin_beta_test(
  uuid, uuid, text, text, text, text, jsonb, jsonb, text[], text, integer, uuid, text
) is 'V3 governed Organizer acceptance-evidence submission with exact edition scope, rollout.manage authorization, stable idempotency and canonical operation receipt.';

notify pgrst, 'reload schema';

commit;
