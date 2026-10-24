begin;

-- System V3 / Organizer O9: make the exact Results input basis reviewed by an
-- organizer part of the authoritative optimistic-concurrency contract.
--
-- studio2_execute_result_operation already protects calculation_version and
-- serializes lifecycle mutations for a show. That version does not move when a
-- Jury/Televote/input row changes before the next calculation, however. A
-- browser-side re-read can therefore narrow the race but cannot close it.
--
-- This migration adds one monotonic per-show review-basis version. Every
-- canonical relation consumed by studio2_result_preconditions / the current
-- Results operation engine advances that version. The reviewed commit locks the
-- same authority row before checking the version. Input mutations must update
-- that row from their trigger before they can commit, so an input mutation is
-- serialized either before the reviewed command (and rejected as stale) or
-- after it (and becomes the next review basis).

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.results.reviewed-input-cas',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive per-show Results review-basis version, governed preflight and stale-reviewed-input rejection. Existing result authority remains available during consumer cutover.'
);
select set_config('request.jwt.claim.role', '', true);

alter table public.studio2_result_operations
  add column if not exists review_basis_version bigint not null default 1;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.studio2_result_operations'::regclass
      and c.conname = 'studio2_result_operations_review_basis_version_check'
  ) then
    alter table public.studio2_result_operations
      add constraint studio2_result_operations_review_basis_version_check
      check (review_basis_version >= 1);
  end if;
end
$constraint$;

-- Every existing show starts with one known review basis. Future mutations move
-- it monotonically; this is a state version, not an attempt to reconstruct a
-- historical mutation count from legacy data.
insert into public.studio2_result_operations (
  show_id,
  edition_id,
  review_basis_version
)
select
  s.id,
  s.edition_id,
  1
from public.shows s
on conflict (show_id) do nothing;

create or replace function private.studio2_bump_result_review_basis(
  p_show_id uuid
) returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_version bigint;
begin
  if p_show_id is null then
    return null;
  end if;

  insert into public.studio2_result_operations (
    show_id,
    edition_id,
    review_basis_version
  )
  select
    s.id,
    s.edition_id,
    1
  from public.shows s
  where s.id = p_show_id
  on conflict (show_id) do update
    set review_basis_version = public.studio2_result_operations.review_basis_version + 1,
        updated_at = now()
  returning review_basis_version into v_version;

  return v_version;
end
$function$;

revoke all on function private.studio2_bump_result_review_basis(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_bump_result_review_basis(uuid)
  to service_role;

create or replace function private.studio2_result_review_basis_row_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
declare
  v_old_show_id uuid;
  v_new_show_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_show_id := old.show_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_show_id := new.show_id;
  end if;

  if v_old_show_id is not null then
    perform private.studio2_bump_result_review_basis(v_old_show_id);
  end if;

  if v_new_show_id is not null
     and v_new_show_id is distinct from v_old_show_id then
    perform private.studio2_bump_result_review_basis(v_new_show_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$trigger$;

revoke all on function private.studio2_result_review_basis_row_changed()
  from public, anon, authenticated;
grant execute on function private.studio2_result_review_basis_row_changed()
  to service_role;

create or replace function private.studio2_result_review_basis_show_changed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  if tg_op = 'INSERT' then
    perform private.studio2_bump_result_review_basis(new.id);
    return new;
  end if;

  -- Only fields consumed by the current Results readiness/publication boundary
  -- invalidate a review. Cosmetic show edits do not manufacture stale reviews.
  if new.voting_config is distinct from old.voting_config
     or new.published is distinct from old.published
     or new.publication_config is distinct from old.publication_config then
    perform private.studio2_bump_result_review_basis(new.id);
  end if;

  return new;
end
$trigger$;

revoke all on function private.studio2_result_review_basis_show_changed()
  from public, anon, authenticated;
grant execute on function private.studio2_result_review_basis_show_changed()
  to service_role;

-- One row-level trigger per canonical show-scoped input relation. Conservative
-- invalidation is intentional: a reviewed official-result operation must be
-- repeated when relevant canonical evidence changed, even if a derived count
-- happens to remain numerically identical.
do $triggers$
begin
  execute 'drop trigger if exists studio2_results_review_basis_participants on public.participants';
  execute 'create trigger studio2_results_review_basis_participants after insert or update or delete on public.participants for each row execute function private.studio2_result_review_basis_row_changed()';

  execute 'drop trigger if exists studio2_results_review_basis_voters on public.voters';
  execute 'create trigger studio2_results_review_basis_voters after insert or update or delete on public.voters for each row execute function private.studio2_result_review_basis_row_changed()';

  execute 'drop trigger if exists studio2_results_review_basis_jury_votes on public.jury_votes';
  execute 'create trigger studio2_results_review_basis_jury_votes after insert or update or delete on public.jury_votes for each row execute function private.studio2_result_review_basis_row_changed()';

  execute 'drop trigger if exists studio2_results_review_basis_jury_statuses on public.jury_ballot_statuses';
  execute 'create trigger studio2_results_review_basis_jury_statuses after insert or update or delete on public.jury_ballot_statuses for each row execute function private.studio2_result_review_basis_row_changed()';

  execute 'drop trigger if exists studio2_results_review_basis_televote_votes on public.televote_votes';
  execute 'create trigger studio2_results_review_basis_televote_votes after insert or update or delete on public.televote_votes for each row execute function private.studio2_result_review_basis_row_changed()';

  execute 'drop trigger if exists studio2_results_review_basis_results on public.results';
  execute 'create trigger studio2_results_review_basis_results after insert or update or delete on public.results for each row execute function private.studio2_result_review_basis_row_changed()';

  execute 'drop trigger if exists studio2_results_review_basis_shows on public.shows';
  execute 'create trigger studio2_results_review_basis_shows after insert or update of voting_config, published, publication_config on public.shows for each row execute function private.studio2_result_review_basis_show_changed()';
end
$triggers$;

-- Authoritative review/preflight. It deliberately does not mutate state and is
-- not a permission slip for a later commit: the commit repeats scope, auth,
-- calculation-version and review-basis checks under the per-show lock.
create or replace function public.studio2_result_operation_preview_v2(
  p_show_id uuid,
  p_action text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_show public.shows%rowtype;
  v_ops public.studio2_result_operations%rowtype;
  v_pre jsonb;
begin
  if p_show_id is null then
    raise exception 'Show id is required' using errcode = '22023';
  end if;

  if p_action not in ('calculate', 'review', 'lock', 'unlock', 'mark_reveal_ready', 'clear_reveal_ready') then
    raise exception 'Unsupported result operation: %', p_action using errcode = '22023';
  end if;

  select * into v_show
  from public.shows s
  where s.id = p_show_id;

  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_verify_results(v_actor, v_show.edition_id) then
    raise exception 'Missing Solaris capability: results.verify' using errcode = '42501';
  end if;

  select * into v_ops
  from public.studio2_result_operations o
  where o.show_id = p_show_id;

  if not found then
    raise exception 'Results review-basis state is unavailable. Refresh after migration reconciliation.'
      using errcode = 'PT409';
  end if;

  v_pre := private.studio2_result_preconditions(p_show_id);

  return jsonb_build_object(
    'schemaVersion', 1,
    'showId', p_show_id,
    'editionId', v_show.edition_id,
    'action', p_action,
    'calculationVersion', v_ops.calculation_version,
    'reviewBasisVersion', v_ops.review_basis_version,
    'stateVersion', v_ops.calculation_version::text || ':' || v_ops.review_basis_version::text,
    'preconditions', v_pre,
    'serverTime', now()
  );
end
$preview$;

revoke all on function public.studio2_result_operation_preview_v2(uuid, text)
  from public, anon;
grant execute on function public.studio2_result_operation_preview_v2(uuid, text)
  to authenticated, service_role;

-- Reviewed commit. Replay is checked before mutable current-state validation so
-- a response lost after commit can still be reconciled after later input drift.
-- New operations then lock the per-show authority row; every canonical input
-- mutation is forced through a trigger update of that same row before commit.
create or replace function public.studio2_execute_result_operation_v2(
  p_show_id uuid,
  p_action text,
  p_reason text,
  p_execution_id uuid,
  p_expected_version bigint,
  p_expected_review_basis_version bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $commit$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_show public.shows%rowtype;
  v_ops public.studio2_result_operations%rowtype;
  v_existing public.studio2_result_operation_executions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_result jsonb;
  v_after_basis bigint;
  v_existing_basis bigint;
  v_existing_previous_version bigint;
begin
  if p_show_id is null
     or p_execution_id is null
     or p_expected_version is null
     or p_expected_review_basis_version is null then
    raise exception 'Show, execution id, expected calculation version and expected review-basis version are required'
      using errcode = '22023';
  end if;

  if p_expected_review_basis_version < 1 then
    raise exception 'Expected review-basis version must be positive' using errcode = '22023';
  end if;

  if p_action not in ('calculate', 'review', 'lock', 'unlock', 'mark_reveal_ready', 'clear_reveal_ready') then
    raise exception 'Unsupported result operation: %', p_action using errcode = '22023';
  end if;

  if length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required' using errcode = '22023';
  end if;

  select * into v_show
  from public.shows s
  where s.id = p_show_id;

  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_verify_results(v_actor, v_show.edition_id) then
    raise exception 'Missing Solaris capability: results.verify' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2-results:' || p_show_id::text, 0));

  select * into v_existing
  from public.studio2_result_operation_executions e
  where e.execution_id = p_execution_id;

  if found then
    if v_existing.show_id <> p_show_id
       or v_existing.action <> p_action
       or v_existing.reason <> v_reason then
      raise exception 'Execution id was already used for a different result operation'
        using errcode = '23505';
    end if;

    v_existing_basis := nullif(v_existing.payload ->> 'reviewBasisVersionBefore', '')::bigint;
    v_existing_previous_version := nullif(v_existing.payload ->> 'previousVersion', '')::bigint;

    if v_existing_basis is null then
      raise exception 'Execution predates reviewed-input protection; reconcile it through the legacy operation contract'
        using errcode = 'PT409';
    end if;

    if v_existing_basis <> p_expected_review_basis_version
       or v_existing_previous_version is distinct from p_expected_version then
      raise exception 'Execution id was reused with a different reviewed Results state'
        using errcode = '23505';
    end if;

    return v_existing.payload || jsonb_build_object(
      'idempotentReplay', true,
      'reviewInputProtected', true
    );
  end if;

  select * into v_ops
  from public.studio2_result_operations o
  where o.show_id = p_show_id
  for update;

  if not found then
    raise exception 'Results review-basis state is unavailable. Refresh after migration reconciliation.'
      using errcode = 'PT409';
  end if;

  if p_expected_version <> v_ops.calculation_version then
    raise exception 'Results changed since this action was reviewed. Refresh before continuing.'
      using errcode = 'PT409';
  end if;

  if p_expected_review_basis_version <> v_ops.review_basis_version then
    raise exception 'Results inputs changed since this action was reviewed. Refresh and review the current inputs before continuing.'
      using errcode = 'PT409';
  end if;

  -- The existing command remains the mutation/result engine. We add the missing
  -- concurrency contract instead of forking its lifecycle rules.
  v_result := public.studio2_execute_result_operation(
    p_show_id,
    p_action,
    v_reason,
    p_execution_id,
    p_expected_version
  );

  select o.review_basis_version into v_after_basis
  from public.studio2_result_operations o
  where o.show_id = p_show_id;

  -- Persist the exact reviewed basis inside the existing immutable execution
  -- receipt payload in the same transaction. Downstream S5 event emission stays
  -- owned by the established Results consequence bridge.
  update public.studio2_result_operation_executions e
  set payload = e.payload || jsonb_build_object(
    'reviewBasisVersionBefore', p_expected_review_basis_version,
    'reviewBasisVersionAfter', v_after_basis,
    'reviewInputProtected', true
  )
  where e.execution_id = p_execution_id;

  return v_result || jsonb_build_object(
    'reviewBasisVersionBefore', p_expected_review_basis_version,
    'reviewBasisVersionAfter', v_after_basis,
    'reviewInputProtected', true
  );
end
$commit$;

revoke all on function public.studio2_execute_result_operation_v2(uuid, text, text, uuid, bigint, bigint)
  from public, anon;
grant execute on function public.studio2_execute_result_operation_v2(uuid, text, text, uuid, bigint, bigint)
  to authenticated, service_role;

comment on column public.studio2_result_operations.review_basis_version is
  'Monotonic per-show optimistic-concurrency version for the canonical Results input/readiness basis reviewed by an Organizer.';
comment on function public.studio2_result_operation_preview_v2(uuid, text) is
  'Authoritative Results operation preflight. Returns exact calculation + reviewed-input basis versions and current canonical preconditions; commit revalidates both.';
comment on function public.studio2_execute_result_operation_v2(uuid, text, text, uuid, bigint, bigint) is
  'Reviewed Results operation commit. Rejects stale calculation or canonical input basis under lock while preserving same-execution replay after later drift.';

notify pgrst, 'reload schema';

commit;
