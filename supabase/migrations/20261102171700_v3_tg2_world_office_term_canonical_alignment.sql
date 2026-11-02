begin;

-- Terra Solaris Governance TG2 canonical office-term alignment.
--
-- Office history is a durable constitutional record. Keep the adopted master
-- plan's country/edition field names and align only the time/status vocabulary
-- that the initial TG2 foundation created provisionally.

-- Register the destructive/forward-only migration contract before any schema
-- contraction or row normalization, as required by the canonical S13 doctrine.
-- This alignment only targets the TG2 table created immediately before it in
-- the same unreleased foundation series; no historical office terms are
-- fabricated or inferred.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-office-term-canonical-alignment',
      1,
      'forward_fix_only',
      true,
      null,
      'Align the unreleased TG2 office-term schema to canonical started/scheduled-end/actual-end vocabulary and canonical term/status values before downstream Governance work depends on it.'
    );
  end if;
end
$contract$;

alter table public.world_office_terms
  drop constraint if exists world_office_term_kind_check,
  drop constraint if exists world_office_term_status_check,
  drop constraint if exists world_office_term_end_check,
  drop constraint if exists world_office_term_time_check;

-- Canonical master-plan names remain represented_country_id, start_edition_id
-- and end_edition_id. Do not rename those relational fields.
alter table public.world_office_terms
  rename column starts_at to started_at;

alter table public.world_office_terms
  rename column ends_at to actual_end_at;

alter table public.world_office_terms
  add column scheduled_end_at timestamptz;

-- No production rows exist yet for this new subsystem, but keep the migration
-- safe for disposable/local stacks that may already have exercised TG2 core.
update public.world_office_terms
set term_kind = case term_kind
  when 'acting' then 'acting'
  when 'interim' then 'interim'
  else 'full'
end;

update public.world_office_terms
set status = case status
  when 'active' then 'active'
  when 'concluded' then 'ended'
  when 'superseded' then 'ended'
  when 'historical' then 'ended'
  else 'ended'
end;

alter table public.world_office_terms
  alter column term_kind set default 'full',
  alter column status set default 'active';

alter table public.world_office_terms
  add constraint world_office_term_kind_check
    check (term_kind in ('full','acting','interim','partial','renewed')),
  add constraint world_office_term_status_check
    check (status in ('scheduled','active','ended','removed','resigned')),
  add constraint world_office_term_end_check
    check (
      (status in ('scheduled','active') and actual_end_at is null)
      or (status in ('ended','removed','resigned') and actual_end_at is not null)
    ),
  add constraint world_office_term_scheduled_time_check
    check (scheduled_end_at is null or scheduled_end_at >= started_at),
  add constraint world_office_term_actual_time_check
    check (actual_end_at is null or actual_end_at >= started_at),
  add constraint world_office_term_predecessor_self_check
    check (predecessor_term_id is null or predecessor_term_id <> id);

comment on column public.world_office_terms.scheduled_end_at is
  'Constitutional/planned end. Separate from the actual end so early resignation, removal and acting transitions remain reconstructible.';
comment on column public.world_office_terms.actual_end_at is
  'Actual end of the office term. Null for scheduled/active terms.';

commit;
