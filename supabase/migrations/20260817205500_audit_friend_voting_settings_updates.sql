-- Clean-replay compatibility: this audit RPC was timestamped before the
-- migration that creates friend_voting_settings. Production databases that
-- already recorded this migration do not rerun it. Fresh replays need the
-- canonical table shape early so PostgreSQL can compile the %rowtype
-- declarations below; 20260817224500 still owns the singleton seed, trigger,
-- RLS enablement and table documentation.
create table if not exists public.friend_voting_settings (
  id text primary key default 'default',
  min_independent_editions integer not null default 3,
  full_confidence_editions integer not null default 4,
  support_edition_threshold numeric not null default 0.75,
  maximum_edition_threshold numeric not null default 0.45,
  reciprocal_edition_threshold numeric not null default 0.60,
  intensity_threshold numeric not null default 0.50,
  cross_channel_min_editions integer not null default 2,
  base_confidence_weight numeric not null default 20,
  support_weight numeric not null default 22,
  maximum_weight numeric not null default 16,
  reciprocity_weight numeric not null default 16,
  intensity_weight numeric not null default 10,
  cross_channel_weight numeric not null default 10,
  cross_channel_per_edition_weight numeric not null default 3,
  one_edition_cap integer not null default 29,
  two_edition_cap integer not null default 49,
  clique_min_edge_risk integer not null default 65,
  clique_internal_share_threshold numeric not null default 0.50,
  clique_min_members integer not null default 3,
  clique_min_density numeric not null default 0.50,
  risk_notable integer not null default 30,
  risk_review integer not null default 50,
  risk_strong integer not null default 65,
  risk_high integer not null default 80,
  risk_critical integer not null default 90,
  updated_at timestamptz not null default now(),
  constraint friend_voting_settings_singleton check (id = 'default'),
  constraint friend_voting_settings_positive_editions check (
    min_independent_editions >= 1 and
    full_confidence_editions >= 1 and
    cross_channel_min_editions >= 1
  ),
  constraint friend_voting_settings_fraction_checks check (
    support_edition_threshold between 0 and 1 and
    maximum_edition_threshold between 0 and 1 and
    reciprocal_edition_threshold between 0 and 1 and
    intensity_threshold between 0 and 1 and
    clique_internal_share_threshold between 0 and 1 and
    clique_min_density between 0 and 1
  ),
  constraint friend_voting_settings_risk_checks check (
    one_edition_cap between 0 and 100 and
    two_edition_cap between 0 and 100 and
    clique_min_edge_risk between 0 and 100 and
    risk_notable between 0 and 100 and
    risk_review between 0 and 100 and
    risk_strong between 0 and 100 and
    risk_high between 0 and 100 and
    risk_critical between 0 and 100
  ),
  constraint friend_voting_settings_band_order check (
    risk_notable <= risk_review and
    risk_review <= risk_strong and
    risk_strong <= risk_high and
    risk_high <= risk_critical
  ),
  constraint friend_voting_settings_clique_members check (clique_min_members >= 2),
  constraint friend_voting_settings_weights check (
    base_confidence_weight >= 0 and
    support_weight >= 0 and
    maximum_weight >= 0 and
    reciprocity_weight >= 0 and
    intensity_weight >= 0 and
    cross_channel_weight >= 0 and
    cross_channel_per_edition_weight >= 0
  )
);

create or replace function public.update_friend_voting_settings_with_audit(
  p_actor_id uuid,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.friend_voting_settings%rowtype;
  v_after public.friend_voting_settings%rowtype;
begin
  select * into v_before
  from public.friend_voting_settings
  where id = 'default'
  for update;

  if not found then
    insert into public.friend_voting_settings (id) values ('default')
    returning * into v_before;
  end if;

  update public.friend_voting_settings
  set
    min_independent_editions = coalesce((p_values->>'min_independent_editions')::integer, min_independent_editions),
    full_confidence_editions = coalesce((p_values->>'full_confidence_editions')::integer, full_confidence_editions),
    support_edition_threshold = coalesce((p_values->>'support_edition_threshold')::numeric, support_edition_threshold),
    maximum_edition_threshold = coalesce((p_values->>'maximum_edition_threshold')::numeric, maximum_edition_threshold),
    reciprocal_edition_threshold = coalesce((p_values->>'reciprocal_edition_threshold')::numeric, reciprocal_edition_threshold),
    intensity_threshold = coalesce((p_values->>'intensity_threshold')::numeric, intensity_threshold),
    cross_channel_min_editions = coalesce((p_values->>'cross_channel_min_editions')::integer, cross_channel_min_editions),
    base_confidence_weight = coalesce((p_values->>'base_confidence_weight')::numeric, base_confidence_weight),
    support_weight = coalesce((p_values->>'support_weight')::numeric, support_weight),
    maximum_weight = coalesce((p_values->>'maximum_weight')::numeric, maximum_weight),
    reciprocity_weight = coalesce((p_values->>'reciprocity_weight')::numeric, reciprocity_weight),
    intensity_weight = coalesce((p_values->>'intensity_weight')::numeric, intensity_weight),
    cross_channel_weight = coalesce((p_values->>'cross_channel_weight')::numeric, cross_channel_weight),
    cross_channel_per_edition_weight = coalesce((p_values->>'cross_channel_per_edition_weight')::numeric, cross_channel_per_edition_weight),
    one_edition_cap = coalesce((p_values->>'one_edition_cap')::integer, one_edition_cap),
    two_edition_cap = coalesce((p_values->>'two_edition_cap')::integer, two_edition_cap),
    clique_min_edge_risk = coalesce((p_values->>'clique_min_edge_risk')::integer, clique_min_edge_risk),
    clique_internal_share_threshold = coalesce((p_values->>'clique_internal_share_threshold')::numeric, clique_internal_share_threshold),
    clique_min_members = coalesce((p_values->>'clique_min_members')::integer, clique_min_members),
    clique_min_density = coalesce((p_values->>'clique_min_density')::numeric, clique_min_density),
    risk_notable = coalesce((p_values->>'risk_notable')::integer, risk_notable),
    risk_review = coalesce((p_values->>'risk_review')::integer, risk_review),
    risk_strong = coalesce((p_values->>'risk_strong')::integer, risk_strong),
    risk_high = coalesce((p_values->>'risk_high')::integer, risk_high),
    risk_critical = coalesce((p_values->>'risk_critical')::integer, risk_critical)
  where id = 'default'
  returning * into v_after;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    p_actor_id,
    'update_friend_voting_settings',
    'friend_voting_settings',
    'default',
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.update_friend_voting_settings_with_audit(uuid, jsonb) from public;
grant execute on function public.update_friend_voting_settings_with_audit(uuid, jsonb) to service_role;

comment on function public.update_friend_voting_settings_with_audit(uuid, jsonb) is
  'Atomically updates the singleton HOD-aware friend-voting model and records before/after values in admin_audit_log.';
