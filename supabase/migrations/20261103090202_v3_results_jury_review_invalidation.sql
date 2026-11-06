begin;

select public.v3_register_migration_contract(
  'v3.results.jury-review-invalidation',
  1,
  'forward_fix_only',
  false,
  null,
  'Make Jury ballot lifecycle changes invalidate Results approval without manufacturing calculated Results versions.'
);

-- A Jury ballot status change mutates score inputs, not an official calculation.
-- These separate monotonic revisions prevent stale Results from being re-reviewed.
create table if not exists private.v3_result_input_revisions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  input_revision bigint not null default 0 check (input_revision >= 0),
  calculated_revision bigint not null default 0 check (calculated_revision >= 0)
);

revoke all on table private.v3_result_input_revisions
  from public, anon, authenticated;
grant select on table private.v3_result_input_revisions to service_role;

create or replace function private.v3_mark_result_input_calculated()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $calculated$
begin
  if new.calculation_version > 0
     and (tg_op = 'INSERT'
       or new.calculation_version is distinct from old.calculation_version) then
    insert into private.v3_result_input_revisions (
      show_id, input_revision, calculated_revision
    ) values (new.show_id, 0, 0)
    on conflict (show_id) do update
      set calculated_revision = private.v3_result_input_revisions.input_revision;
  end if;
  return new;
end
$calculated$;

revoke all on function private.v3_mark_result_input_calculated()
  from public, anon, authenticated;

drop trigger if exists v3_mark_result_input_calculated
  on public.studio2_result_operations;
create trigger v3_mark_result_input_calculated
after insert or update of calculation_version
on public.studio2_result_operations
for each row execute function private.v3_mark_result_input_calculated();

create or replace function private.v3_guard_stale_result_input_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $approval$
begin
  if (
    new.reviewed_version is not null
    or new.locked_version is not null
    or new.reveal_ready_version is not null
  ) and exists (
    select 1
    from private.v3_result_input_revisions state
    where state.show_id = new.show_id
      and state.input_revision <> state.calculated_revision
  ) then
    raise exception
      'Results input changed since the last calculation. Recalculate before review.'
      using errcode = '55000';
  end if;
  return new;
end
$approval$;

revoke all on function private.v3_guard_stale_result_input_approval()
  from public, anon, authenticated;

drop trigger if exists v3_guard_stale_result_input_approval
  on public.studio2_result_operations;
create trigger v3_guard_stale_result_input_approval
before insert or update of reviewed_version, locked_version, reveal_ready_version
on public.studio2_result_operations
for each row execute function private.v3_guard_stale_result_input_approval();

create or replace function private.studio2_sync_results_after_jury_ballot_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $sync$
declare
  v_show_id uuid := case
    when tg_op = 'DELETE' then old.show_id
    else new.show_id
  end;
begin
  if v_show_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || v_show_id::text, 0)
  );

  if exists (
    select 1
    from public.shows show_row
    where show_row.id = v_show_id
      and coalesce(show_row.published, false)
      and private.studio2_publication_has_outcomes(show_row.publication_config)
  ) then
    raise exception
      'Make the published result layer private before changing a jury ballot lifecycle.'
      using errcode = '55000';
  end if;

  -- Jury ballot review changes Results input truth.
  -- It must not manufacture a new calculated Results version.
  --
  -- Explicit Results calculation remains the only authority that advances
  -- calculation_version and captures a new immutable result snapshot.
  --
  -- If a calculated result already exists, its approval state becomes stale
  -- and must be re-established only after a fresh explicit calculation.
  -- Rebuild the score projection from *valid* ballots before any later
  -- explicit Results calculation captures an immutable version.
  perform public.sync_show_results_from_votes(v_show_id);

  insert into private.v3_result_input_revisions (
    show_id, input_revision, calculated_revision
  ) values (v_show_id, 1, 0)
  on conflict (show_id) do update
    set input_revision = private.v3_result_input_revisions.input_revision + 1;

  update public.studio2_result_operations
  set reviewed_version = null,
      reviewed_at = null,
      reviewed_by = null,
      locked_version = null,
      locked_at = null,
      locked_by = null,
      reveal_ready_version = null,
      reveal_ready_at = null,
      reveal_ready_by = null,
      updated_at = now()
  where show_id = v_show_id;

  return null;
end
$sync$;

revoke all on function private.studio2_sync_results_after_jury_ballot_review()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
