begin;

create table public.studio2_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  admins_only boolean not null default false,
  user_ids uuid[] not null default '{}'::uuid[],
  edition_ids uuid[] not null default '{}'::uuid[],
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio2_feature_flags_key_check check (
    key in (
      'edition_state_engine', 'contest_event_engine', 'permission_engine_v2',
      'workflow_engine', 'official_communications', 'hod_workspace_v2',
      'live_control_room', 'incident_command', 'broadcast_rundown',
      'results_replay', 'voting_lab', 'edition_simulator', 'rules_engine',
      'public_encyclopedia', 'country_voting_dna', 'prediction_league',
      'fantasy_ssc', 'time_machine', 'solaris_command_assistant'
    )
  )
);

create trigger studio2_feature_flags_touch_updated_at
before update on public.studio2_feature_flags
for each row execute function private.studio2_touch_updated_at();

insert into public.studio2_feature_flags (key)
values
  ('edition_state_engine'),
  ('contest_event_engine'),
  ('permission_engine_v2'),
  ('workflow_engine'),
  ('official_communications'),
  ('hod_workspace_v2'),
  ('live_control_room'),
  ('incident_command'),
  ('broadcast_rundown'),
  ('results_replay'),
  ('voting_lab'),
  ('edition_simulator'),
  ('rules_engine'),
  ('public_encyclopedia'),
  ('country_voting_dna'),
  ('prediction_league'),
  ('fantasy_ssc'),
  ('time_machine'),
  ('solaris_command_assistant')
on conflict (key) do nothing;

alter table public.studio2_feature_flags enable row level security;
revoke all on table public.studio2_feature_flags from public, anon, authenticated;
grant select on table public.studio2_feature_flags to authenticated;
grant all on table public.studio2_feature_flags to service_role;

create policy studio2_feature_flags_organizer_read
on public.studio2_feature_flags
for select
to authenticated
using (public.has_role((select auth.uid()), 'organizer'::public.app_role));

create or replace function private.studio2_feature_enabled_for(
  p_user_id uuid,
  p_key text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select
      f.enabled
      and (not f.admins_only or public.has_role(p_user_id, 'organizer'::public.app_role))
      and (
        cardinality(f.user_ids) = 0
        or (p_user_id is not null and p_user_id = any(f.user_ids))
      )
      and (
        cardinality(f.edition_ids) = 0
        or (p_edition_id is not null and p_edition_id = any(f.edition_ids))
      )
    from public.studio2_feature_flags f
    where f.key = p_key
  ), false)
$$;

create or replace function public.studio2_feature_enabled(
  p_key text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_feature_enabled_for(auth.uid(), p_key, p_edition_id)
$$;

create or replace function public.studio2_set_feature_flag(
  p_key text,
  p_enabled boolean,
  p_admins_only boolean default false,
  p_user_ids uuid[] default '{}'::uuid[],
  p_edition_ids uuid[] default '{}'::uuid[]
)
returns public.studio2_feature_flags
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_row public.studio2_feature_flags%rowtype;
begin
  if not v_is_service and not public.has_role(v_actor, 'organizer'::public.app_role) then
    raise exception 'Organizer role required' using errcode = '42501';
  end if;

  if p_key is null then
    raise exception 'Feature flag key is required' using errcode = '22023';
  end if;

  insert into public.studio2_feature_flags (
    key, enabled, admins_only, user_ids, edition_ids, updated_by
  ) values (
    p_key,
    coalesce(p_enabled, false),
    coalesce(p_admins_only, false),
    coalesce(p_user_ids, '{}'::uuid[]),
    coalesce(p_edition_ids, '{}'::uuid[]),
    v_actor
  )
  on conflict (key) do update set
    enabled = excluded.enabled,
    admins_only = excluded.admins_only,
    user_ids = excluded.user_ids,
    edition_ids = excluded.edition_ids,
    updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end
$$;

revoke all on function private.studio2_feature_enabled_for(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.studio2_feature_enabled(text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_feature_enabled(text, uuid)
  to authenticated;
revoke all on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[])
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
