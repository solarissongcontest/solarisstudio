begin;

-- Terra Solaris Governance TG2 canonical office-term alignment.
--
-- The initial TG2 foundation intentionally stays generic, but office history is
-- a durable constitutional record. Align the unmerged foundation with the
-- adopted Terra Solaris vocabulary before downstream elections, succession,
-- projections and Archive readers depend on it.

alter table public.world_office_terms
  drop constraint if exists world_office_term_kind_check,
  drop constraint if exists world_office_term_status_check,
  drop constraint if exists world_office_term_end_check,
  drop constraint if exists world_office_term_time_check;

alter table public.world_office_terms
  rename column represented_country_id to country_id;

alter table public.world_office_terms
  rename column start_edition_id to starts_edition_id;

alter table public.world_office_terms
  rename column end_edition_id to ends_edition_id;

alter table public.world_office_terms
  rename column starts_at to started_at;

alter table public.world_office_terms
  rename column ends_at to actual_end_at;

alter table public.world_office_terms
  add column scheduled_end_at timestamptz,
  add column successor_term_id uuid references public.world_office_terms(id) on delete set null;

-- No production rows exist yet for this new subsystem, but keep the migration
-- safe for disposable/local stacks that may already have exercised the first
-- foundation migration.
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
  add constraint world_office_term_successor_self_check
    check (successor_term_id is null or successor_term_id <> id),
  add constraint world_office_term_predecessor_self_check
    check (predecessor_term_id is null or predecessor_term_id <> id);

comment on column public.world_office_terms.scheduled_end_at is
  'Constitutional/planned end. Kept separate from the actual end so early resignation, removal and acting transitions remain reconstructible.';
comment on column public.world_office_terms.actual_end_at is
  'Actual end of the office term. Null for scheduled/active terms.';

commit;
