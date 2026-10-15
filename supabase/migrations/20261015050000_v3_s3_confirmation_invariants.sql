begin;

-- System V3 S3: Confirmation invariants.
--
-- The canonical requirement model and its partial unique index already prevent
-- a later submission round from creating a second effective requirement. This
-- migration audits that deployed foundation, performs only mechanically safe
-- repair, stages and validates the lifecycle constraint, and guards the
-- cross-table relationship to the submission that resolved a requirement.

-- AUDIT: fail closed if an installation does not have the S1/S2-era unique
-- invariant. Do not silently replace a differently defined index by name.
do $audit$
declare
  v_is_unique boolean;
  v_predicate text;
begin
  select index_row.indisunique, pg_get_expr(index_row.indpred, index_row.indrelid)
  into v_is_unique, v_predicate
  from pg_catalog.pg_class index_class
  join pg_catalog.pg_namespace index_namespace
    on index_namespace.oid = index_class.relnamespace
  join pg_catalog.pg_index index_row
    on index_row.indexrelid = index_class.oid
  where index_namespace.nspname = 'public'
    and index_class.relname = 'studio2_confirmation_requirements_current_idx';

  if not coalesce(v_is_unique, false)
     or coalesce(v_predicate, '') <> '(superseded_at IS NULL)' then
    raise exception
      'Confirmation invariant audit failed: current-requirement unique index is missing or malformed';
  end if;

  if exists (
    select 1
    from public.studio2_confirmation_requirements requirement
    group by requirement.edition_id, requirement.country_id
    having count(*) filter (where requirement.superseded_at is null) > 1
  ) then
    raise exception
      'Confirmation invariant audit failed: duplicate effective requirements exist';
  end if;
end
$audit$;

-- REPAIR: the old row-local check required resolved_at to be null for required
-- rows, but did not clear a stale FK. Clearing that FK restores the declared
-- unresolved state without inventing a domain decision.
update public.studio2_confirmation_requirements
set
  resolved_by_submission_id = null,
  updated_at = now()
where status = 'required'
  and resolved_by_submission_id is not null;

-- STAGE -> VALIDATE -> ENFORCE. PostgreSQL begins enforcing a NOT VALID CHECK
-- for new writes immediately; validation then proves all historical rows.
alter table public.studio2_confirmation_requirements
  add constraint studio2_confirmation_requirement_lifecycle_v3_check
  check (
    (
      status = 'required'
      and superseded_at is null
      and resolved_at is null
      and resolved_by_submission_id is null
      and invalidated_at is null
      and invalidated_by is null
      and invalidated_reason is null
    )
    or (
      status in ('satisfied', 'waived')
      and superseded_at is null
      and resolved_at is not null
      and invalidated_at is null
      and invalidated_by is null
      and invalidated_reason is null
    )
    or (
      status = 'invalidated'
      and superseded_at is not null
      and invalidated_at is not null
      and nullif(btrim(invalidated_reason), '') is not null
      and superseded_at >= invalidated_at
    )
  ) not valid;

alter table public.studio2_confirmation_requirements
  validate constraint studio2_confirmation_requirement_lifecycle_v3_check;

-- A foreign key proves that a submission exists, but not that it belongs to
-- the same edition/delegation or post-dates this requirement generation. Keep
-- the intentionally documented legacy completion (which has no retained
-- submission) valid, while rejecting every newly linked mismatch.
create or replace function private.studio2_guard_confirmation_resolution_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_submission public.submissions;
  v_submission_country_id uuid;
begin
  if new.resolved_by_submission_id is null then
    return new;
  end if;

  if new.status not in ('satisfied', 'waived') then
    raise exception
      'A confirmation resolution submission requires satisfied or waived status'
      using errcode = '23514';
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = new.resolved_by_submission_id;

  if v_submission.id is null then
    return new; -- The foreign key supplies the canonical missing-row error.
  end if;

  v_submission_country_id := private.studio2_confirmation_country_id(v_submission.country);

  if v_submission.edition_id is distinct from new.edition_id
     or v_submission_country_id is distinct from new.country_id
     or coalesce(v_submission.updated_at, v_submission.submitted_at) < new.valid_from then
    raise exception
      'Confirmation resolution submission is outside the requirement generation scope'
      using errcode = '23514';
  end if;

  return new;
end
$guard$;

revoke all on function private.studio2_guard_confirmation_resolution_scope()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_resolution_scope_guard
  on public.studio2_confirmation_requirements;
create trigger studio2_confirmation_resolution_scope_guard
before insert or update of
  edition_id,
  country_id,
  status,
  valid_from,
  resolved_by_submission_id
on public.studio2_confirmation_requirements
for each row
execute function private.studio2_guard_confirmation_resolution_scope();

-- Validate the cross-table invariant before making the migration visible.
do $validate$
begin
  if exists (
    select 1
    from public.studio2_confirmation_requirements requirement
    join public.submissions submission
      on submission.id = requirement.resolved_by_submission_id
    where submission.edition_id is distinct from requirement.edition_id
       or private.studio2_confirmation_country_id(submission.country)
            is distinct from requirement.country_id
       or coalesce(submission.updated_at, submission.submitted_at) < requirement.valid_from
  ) then
    raise exception
      'Confirmation invariant validation failed: resolution submission scope mismatch';
  end if;
end
$validate$;

commit;
