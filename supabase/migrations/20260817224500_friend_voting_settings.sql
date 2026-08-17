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
  constraint friend_voting_settings_positive_editions check (min_independent_editions >= 1 and full_confidence_editions >= 1 and cross_channel_min_editions >= 1),
  constraint friend_voting_settings_fraction_checks check (
    support_edition_threshold between 0 and 1 and
    maximum_edition_threshold between 0 and 1 and
    reciprocal_edition_threshold between 0 and 1 and
    intensity_threshold between 0 and 1 and
    clique_internal_share_threshold between 0 and 1 and
    clique_min_density between 0 and 1
  ),
  constraint friend_voting_settings_risk_checks check (
    one_edition_cap between 0 and 100 and two_edition_cap between 0 and 100 and
    clique_min_edge_risk between 0 and 100 and risk_notable between 0 and 100 and
    risk_review between 0 and 100 and risk_strong between 0 and 100 and
    risk_high between 0 and 100 and risk_critical between 0 and 100
  ),
  constraint friend_voting_settings_band_order check (
    risk_notable <= risk_review and risk_review <= risk_strong and risk_strong <= risk_high and risk_high <= risk_critical
  ),
  constraint friend_voting_settings_clique_members check (clique_min_members >= 2),
  constraint friend_voting_settings_weights check (
    base_confidence_weight >= 0 and support_weight >= 0 and maximum_weight >= 0 and
    reciprocity_weight >= 0 and intensity_weight >= 0 and cross_channel_weight >= 0 and
    cross_channel_per_edition_weight >= 0
  )
);

insert into public.friend_voting_settings (id)
values ('default')
on conflict (id) do nothing;

create trigger set_friend_voting_settings_updated_at
before update on public.friend_voting_settings
for each row execute function public.update_updated_at_column();

alter table public.friend_voting_settings enable row level security;

comment on table public.friend_voting_settings is
  'Solaris-owned configuration for HOD-aware cross-channel relationship and coordination-group analysis.';