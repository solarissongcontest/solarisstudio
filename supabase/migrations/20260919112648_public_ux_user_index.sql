begin;

create index if not exists public_ux_events_user_id_idx
  on public.public_ux_events (user_id)
  where user_id is not null;

commit;
