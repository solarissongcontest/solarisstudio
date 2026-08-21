alter table public.shows
  add column if not exists lineup_stage text not null default 'lineup';

alter table public.shows
  drop constraint if exists shows_lineup_stage_check;

alter table public.shows
  add constraint shows_lineup_stage_check
  check (lineup_stage in ('lineup', 'allocation', 'running_order'));

alter table public.participants
  add column if not exists running_order_allocation text;

alter table public.participants
  drop constraint if exists participants_running_order_allocation_check;

alter table public.participants
  add constraint participants_running_order_allocation_check
  check (
    running_order_allocation is null
    or running_order_allocation in ('first_half', 'second_half', 'producer_choice')
  );

-- Historical shows that already have real running-order positions should keep behaving
-- as completed running-order workspaces. New shows start at the line-up stage.
update public.shows s
set lineup_stage = 'running_order'
where exists (
  select 1
  from public.participants p
  where p.show_id = s.id
    and p.running_order is not null
);

comment on column public.shows.lineup_stage is
  'Organizer workflow stage: lineup -> allocation -> running_order.';

comment on column public.participants.running_order_allocation is
  'Allocation-draw result before running order: first_half, second_half, or producer_choice.';
