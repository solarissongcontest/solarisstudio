insert into public.studio2_feature_flags (
  key,
  enabled,
  admins_only,
  user_ids,
  edition_ids
)
values (
  'public_ia_v3',
  true,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do update set
  enabled = true,
  admins_only = false,
  user_ids = '{}'::uuid[],
  edition_ids = '{}'::uuid[];

create or replace function public.public_ia_v3_enabled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select f.enabled
    from public.studio2_feature_flags f
    where f.key = 'public_ia_v3'
  ), true)
$$;

revoke all on function public.public_ia_v3_enabled()
from public, anon, authenticated;

grant execute on function public.public_ia_v3_enabled()
to anon, authenticated;

comment on function public.public_ia_v3_enabled() is
  'Public-safe rollout switch for Solaris public IA v3. Returns only the global enabled boolean; false is reserved for emergency legacy-navigation rollback.';

comment on column public.studio2_feature_flags.admins_only is
  'When true, enabled features are visible only to Organizer-capable users. Public IA v3 is globally available and uses enabled=false only for emergency rollback.';

notify pgrst, 'reload schema';
