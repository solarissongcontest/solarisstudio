begin;

-- S3 Results invariant: a lifecycle version must identify immutable evidence,
-- not merely a counter beside mutable public.results rows.
create unique index if not exists shows_id_edition_id_v3_uidx
  on public.shows (id, edition_id);

alter table public.results
  add constraint results_show_edition_v3_fk
  foreign key (show_id, edition_id)
  references public.shows (id, edition_id)
  on delete cascade
  not valid;

alter table public.studio2_result_operations
  add constraint studio2_result_operations_show_edition_v3_fk
  foreign key (show_id, edition_id)
  references public.shows (id, edition_id)
  on delete cascade
  not valid;

alter table public.studio2_result_operation_executions
  add constraint studio2_result_operation_executions_show_edition_v3_fk
  foreign key (show_id, edition_id)
  references public.shows (id, edition_id)
  on delete cascade
  not valid;

alter table public.studio2_show_publication_controls
  add constraint studio2_show_publication_controls_show_edition_v3_fk
  foreign key (show_id, edition_id)
  references public.shows (id, edition_id)
  on delete cascade
  not valid;

alter table public.studio2_show_publication_executions
  add constraint studio2_show_publication_executions_show_edition_v3_fk
  foreign key (show_id, edition_id)
  references public.shows (id, edition_id)
  on delete cascade
  not valid;

alter table public.results validate constraint results_show_edition_v3_fk;
alter table public.studio2_result_operations
  validate constraint studio2_result_operations_show_edition_v3_fk;
alter table public.studio2_result_operation_executions
  validate constraint studio2_result_operation_executions_show_edition_v3_fk;
alter table public.studio2_show_publication_controls
  validate constraint studio2_show_publication_controls_show_edition_v3_fk;
alter table public.studio2_show_publication_executions
  validate constraint studio2_show_publication_executions_show_edition_v3_fk;

create table private.v3_result_versions (
  show_id uuid not null,
  edition_id uuid not null,
  version bigint not null check (version > 0),
  result_rows jsonb not null check (jsonb_typeof(result_rows) = 'array'),
  result_row_count integer not null check (result_row_count >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (show_id, version),
  constraint v3_result_versions_show_edition_fk
    foreign key (show_id, edition_id)
    references public.shows (id, edition_id)
);

alter table private.v3_result_versions enable row level security;
revoke all on table private.v3_result_versions from public, anon, authenticated;
grant select, insert on table private.v3_result_versions to service_role;

create or replace function private.v3_capture_result_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_rows jsonb;
  v_count integer;
begin
  if new.calculation_version < 1
     or (tg_op = 'UPDATE' and new.calculation_version = old.calculation_version) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.calculation_version <> old.calculation_version + 1 then
    raise exception 'Result calculation versions must advance exactly once'
      using errcode = '23514';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', result.id,
          'countryId', result.country_id,
          'contestEntityId', result.contest_entity_id,
          'juryPoints', result.jury_points,
          'televotePoints', result.televote_points,
          'televoteComponents', result.televote_components,
          'totalPoints', result.total_points,
          'finalRank', result.final_rank
        ) order by result.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_rows, v_count
  from public.results result
  where result.show_id = new.show_id
    and result.edition_id = new.edition_id;

  insert into private.v3_result_versions (
    show_id, edition_id, version, result_rows, result_row_count, created_by
  ) values (
    new.show_id, new.edition_id, new.calculation_version,
    v_rows, v_count, new.last_calculated_by
  );

  return new;
end
$capture$;

revoke all on function private.v3_capture_result_version()
  from public, anon, authenticated;

create trigger v3_capture_result_version
after insert or update of calculation_version
on public.studio2_result_operations
for each row execute function private.v3_capture_result_version();

-- Preserve a pre-existing current version during an upgrade. No historical
-- version is fabricated: older counters without exact evidence remain absent.
insert into private.v3_result_versions (
  show_id, edition_id, version, result_rows, result_row_count, created_by, created_at
)
select
  operation.show_id,
  operation.edition_id,
  operation.calculation_version,
  coalesce(snapshot.rows, '[]'::jsonb),
  coalesce(snapshot.row_count, 0),
  operation.last_calculated_by,
  coalesce(operation.last_calculated_at, operation.updated_at, now())
from public.studio2_result_operations operation
left join lateral (
  select
    jsonb_agg(
      jsonb_build_object(
        'id', result.id,
        'countryId', result.country_id,
        'contestEntityId', result.contest_entity_id,
        'juryPoints', result.jury_points,
        'televotePoints', result.televote_points,
        'televoteComponents', result.televote_components,
        'totalPoints', result.total_points,
        'finalRank', result.final_rank
      ) order by result.id
    ) as rows,
    count(*)::integer as row_count
  from public.results result
  where result.show_id = operation.show_id
    and result.edition_id = operation.edition_id
) snapshot on true
where operation.calculation_version > 0
on conflict (show_id, version) do nothing;

-- Existing lifecycle pointers are only valid when they point at the current
-- evidence. Reject an ambiguous legacy state instead of inventing snapshots.
do $audit$
begin
  if exists (
    select 1
    from public.studio2_result_operations operation
    cross join lateral unnest(array[
      operation.reviewed_version,
      operation.locked_version,
      operation.reveal_ready_version
    ]) pointer(version)
    where pointer.version is not null
      and pointer.version <> operation.calculation_version
  ) then
    raise exception 'Legacy result lifecycle pointer lacks exact immutable evidence';
  end if;
end
$audit$;

alter table public.studio2_result_operations
  add constraint studio2_result_operations_reviewed_snapshot_v3_fk
    foreign key (show_id, reviewed_version)
    references private.v3_result_versions (show_id, version)
    deferrable initially deferred,
  add constraint studio2_result_operations_locked_snapshot_v3_fk
    foreign key (show_id, locked_version)
    references private.v3_result_versions (show_id, version)
    deferrable initially deferred,
  add constraint studio2_result_operations_reveal_snapshot_v3_fk
    foreign key (show_id, reveal_ready_version)
    references private.v3_result_versions (show_id, version)
    deferrable initially deferred;

alter table public.studio2_result_operation_executions
  add constraint studio2_result_operation_executions_snapshot_v3_fk
  foreign key (show_id, calculation_version)
  references private.v3_result_versions (show_id, version)
  deferrable initially deferred;

alter table public.studio2_show_publication_controls
  add constraint studio2_show_publication_source_snapshot_v3_fk
  foreign key (show_id, source_result_version)
  references private.v3_result_versions (show_id, version)
  deferrable initially deferred
  not valid;

alter table public.studio2_show_publication_controls
  validate constraint studio2_show_publication_source_snapshot_v3_fk;

alter table public.studio2_show_publication_executions
  add constraint studio2_show_publication_executions_source_snapshot_v3_fk
  foreign key (show_id, source_result_version)
  references private.v3_result_versions (show_id, version)
  deferrable initially deferred
  not valid;

alter table public.studio2_show_publication_executions
  validate constraint studio2_show_publication_executions_source_snapshot_v3_fk;

create or replace function private.v3_reject_result_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $guard$
begin
  raise exception 'Result version evidence is immutable' using errcode = '55000';
end
$guard$;

revoke all on function private.v3_reject_result_version_mutation()
  from public, anon, authenticated;

create trigger v3_reject_result_version_mutation
before update or delete on private.v3_result_versions
for each row execute function private.v3_reject_result_version_mutation();

commit;
