-- Move the operational Televoting backend into the Solaris Studio Supabase
-- project without colliding with canonical public countries/editions/results.
-- No ballots or calculated result values are seeded by this migration.

create schema if not exists televoting;
grant usage on schema televoting to anon, authenticated, service_role;

-- Expose both canonical Studio data and the isolated Televoting schema through
-- the Data API. This is intentionally managed in SQL so Cloudflare and Lovable
-- use the same backend contract.
alter role authenticator set pgrst.db_schemas = 'public, televoting';
notify pgrst, 'reload config';

do $$ begin
  create type televoting.round_status as enum ('draft','open','closed');
exception when duplicate_object then null;
end $$;

create or replace function televoting.update_updated_at_column()
returns trigger language plpgsql set search_path = televoting, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table if not exists televoting.countries (
  code text primary key,
  name text not null,
  flag text not null default '✦',
  flag_url text
);

create table if not exists televoting.editions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists televoting.rounds (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references televoting.editions(id) on delete cascade,
  name text not null,
  status televoting.round_status not null default 'draft',
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  total_points_to_distribute integer not null default 0 check (total_points_to_distribute >= 0),
  rank_exponent numeric not null default 1.33,
  results_status text not null default 'draft' check (results_status in ('draft','calculated','locked','published')),
  calculation_version integer not null default 0,
  calculated_at timestamptz,
  calculated_by uuid,
  calculated_by_username text,
  calc_participant_codes text[],
  results_outdated boolean not null default false,
  public_advanced_transparency boolean not null default false,
  broadcast_display_mode text not null default 'converted' check (broadcast_display_mode in ('original','converted','combined')),
  participant_mode text not null default 'countries' check (participant_mode in ('countries','custom','mixed')),
  self_voting_mode text not null default 'country_match' check (self_voting_mode in ('country_match','linked_identity','disabled','unrestricted'))
);
create unique index if not exists televoting_rounds_single_open
  on televoting.rounds ((true)) where status = 'open';

create table if not exists televoting.round_countries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  country_code text not null references televoting.countries(code),
  display_order integer not null,
  unique (round_id, country_code),
  unique (round_id, display_order)
);

create table if not exists televoting.round_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  entry_type text not null default 'country' check (entry_type in ('country','custom')),
  entry_key text not null,
  country_code text,
  custom_name text,
  short_name text,
  entry_code text,
  subtitle text,
  image_url text,
  description text,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint televoting_round_entries_identity_chk check (
    (entry_type = 'country' and country_code is not null and custom_name is null)
    or (entry_type = 'custom' and custom_name is not null and country_code is null)
  ),
  unique (round_id, entry_key)
);
create index if not exists televoting_round_entries_round_idx
  on televoting.round_entries(round_id, display_order);

create table if not exists televoting.vote_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  username text not null,
  username_normalized text not null,
  country_code text not null,
  ip_hash text,
  fingerprint_hash text,
  device_token_hash text,
  risk_score integer not null default 0,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','suspicious','verified','deleted')),
  ip_country text,
  is_vpn boolean not null default false,
  moderator_note text,
  verified_at timestamptz,
  verified_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  edited_at timestamptz,
  edited_by uuid,
  deletion_category text,
  deletion_reason text
);
create unique index if not exists televoting_vs_round_username
  on televoting.vote_submissions(round_id, username_normalized) where status <> 'deleted';
create unique index if not exists televoting_vs_round_ip
  on televoting.vote_submissions(round_id, ip_hash) where ip_hash is not null and status <> 'deleted';
create unique index if not exists televoting_vs_round_fp
  on televoting.vote_submissions(round_id, fingerprint_hash) where fingerprint_hash is not null and status <> 'deleted';
create unique index if not exists televoting_vs_round_dt
  on televoting.vote_submissions(round_id, device_token_hash) where device_token_hash is not null and status <> 'deleted';
create index if not exists televoting_vs_round_status on televoting.vote_submissions(round_id,status);
create index if not exists televoting_vs_round_risk on televoting.vote_submissions(round_id,risk_score desc);
create index if not exists televoting_vs_country on televoting.vote_submissions(country_code);
create index if not exists televoting_vs_created on televoting.vote_submissions(created_at desc);
create index if not exists televoting_vs_delcat on televoting.vote_submissions(deletion_category);

create table if not exists televoting.vote_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references televoting.vote_submissions(id) on delete cascade,
  target_country_code text not null,
  points integer not null check (points between 1 and 10),
  unique (submission_id, target_country_code)
);
create index if not exists televoting_vote_entries_submission on televoting.vote_entries(submission_id);
create index if not exists televoting_vote_entries_target on televoting.vote_entries(target_country_code);

create table if not exists televoting.anti_abuse_events (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references televoting.rounds(id) on delete set null,
  username text,
  username_normalized text,
  country_code text,
  ip_hash text,
  fingerprint_hash text,
  device_token_hash text,
  reason text not null,
  risk_score integer not null default 0,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Solaris organizer UUIDs are written directly here. No second Televoting
-- password/admin-account system is needed.
create table if not exists televoting.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid,
  actor_username text,
  action text not null,
  target_type text,
  target_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists televoting_admin_audit_created_idx on televoting.admin_audit_log(created_at desc);
create index if not exists televoting_admin_audit_actor_idx on televoting.admin_audit_log(actor_admin_id);

create table if not exists televoting.vote_moderation_events (
  id uuid primary key default gen_random_uuid(),
  vote_submission_id uuid references televoting.vote_submissions(id) on delete set null,
  voting_country_code text,
  target_country_code text,
  action text not null,
  previous_status text,
  new_status text,
  reason_category text,
  moderator_note text,
  performed_by uuid,
  performed_by_username text,
  performed_at timestamptz not null default now()
);
create index if not exists televoting_vme_submission on televoting.vote_moderation_events(vote_submission_id);
create index if not exists televoting_vme_pair on televoting.vote_moderation_events(voting_country_code,target_country_code);
create index if not exists televoting_vme_time on televoting.vote_moderation_events(performed_at desc);

create table if not exists televoting.round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  country_code text not null,
  original_votes integer not null default 0,
  original_voters integer not null default 0,
  original_rank integer not null,
  participant_count integer not null,
  rank_base integer not null,
  rank_exponent numeric not null,
  rank_factor numeric not null,
  weighted_score numeric not null,
  exact_points numeric not null,
  floored_points integer not null,
  decimal_remainder numeric not null,
  remainder_bonus integer not null default 0,
  final_points integer not null,
  total_points_to_distribute integer not null,
  calculation_version integer not null,
  calculated_at timestamptz not null default now(),
  calculated_by_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id,country_code)
);
create index if not exists televoting_round_results_round_idx on televoting.round_results(round_id);

create table if not exists televoting.televote_aggregations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references televoting.editions(id) on delete set null,
  name text not null,
  combination_method text not null default 'raw',
  total_points_to_distribute integer not null default 0,
  rank_exponent numeric not null default 1.33,
  status text not null default 'draft',
  calculation_version integer not null default 0,
  calculated_at timestamptz,
  calculated_by uuid,
  calculated_by_username text,
  locked_at timestamptz,
  published_at timestamptz,
  results_outdated boolean not null default false,
  public_columns jsonb not null default '{"sources":false,"combined_original":false,"converted":true,"bonus":true,"final":true}'::jsonb,
  broadcast_display_mode text not null default 'final',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists televoting.televote_aggregation_participants (
  id uuid primary key default gen_random_uuid(),
  aggregation_id uuid not null references televoting.televote_aggregations(id) on delete cascade,
  country_code text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (aggregation_id,country_code)
);

create table if not exists televoting.televote_aggregation_sources (
  id uuid primary key default gen_random_uuid(),
  aggregation_id uuid not null references televoting.televote_aggregations(id) on delete cascade,
  source_type text not null default 'round',
  source_round_id uuid references televoting.rounds(id) on delete set null,
  source_name text not null,
  calculation_stage text not null default 'pre_conversion',
  weight numeric not null default 1,
  enabled boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  percentage_weight numeric not null default 0,
  calculation_method text not null default 'rank_weighted',
  exact_point_pool numeric not null default 0,
  floored_point_pool integer not null default 0,
  pool_remainder numeric not null default 0,
  pool_remainder_bonus integer not null default 0,
  final_point_pool integer not null default 0,
  correction_target_source_id uuid references televoting.televote_aggregation_sources(id) on delete set null,
  correction_scope text not null default 'final',
  tie_break_data jsonb not null default '{}'::jsonb,
  input_mode text not null default 'raw_results' check (input_mode in ('raw_results','converted_points','activity_points','correction'))
);

create table if not exists televoting.external_score_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references televoting.televote_aggregation_sources(id) on delete cascade,
  country_code text not null,
  value numeric not null default 0,
  entry_type text not null default 'other',
  reason text,
  entered_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id,country_code)
);

create table if not exists televoting.external_score_entry_log (
  id uuid primary key default gen_random_uuid(),
  source_id uuid,
  aggregation_id uuid,
  country_code text,
  previous_value numeric,
  new_value numeric,
  delta numeric,
  entry_type text,
  reason text,
  actor_username text,
  created_at timestamptz not null default now()
);

create table if not exists televoting.combined_televote_results (
  id uuid primary key default gen_random_uuid(),
  aggregation_id uuid not null references televoting.televote_aggregations(id) on delete cascade,
  country_code text not null,
  source_contributions jsonb not null default '[]'::jsonb,
  pre_conversion_total numeric not null default 0,
  manual_pre_conversion_adjustment numeric not null default 0,
  combined_original_score numeric not null default 0,
  combined_original_rank integer not null default 0,
  participant_count integer not null default 0,
  rank_base integer not null default 0,
  rank_exponent numeric not null default 1.33,
  rank_factor numeric not null default 0,
  weighted_score numeric not null default 0,
  exact_converted_points numeric not null default 0,
  floored_points integer not null default 0,
  decimal_remainder numeric not null default 0,
  remainder_bonus integer not null default 0,
  converted_points integer not null default 0,
  post_conversion_bonus numeric not null default 0,
  post_conversion_adjustment numeric not null default 0,
  final_televote_score numeric not null default 0,
  calculation_version integer not null default 0,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  total_voting_points numeric not null default 0,
  total_activity_points numeric not null default 0,
  final_combined_points numeric not null default 0,
  final_correction numeric not null default 0,
  final_rank integer not null default 0,
  final_tie_break_data jsonb not null default '{}'::jsonb,
  component_breakdown jsonb not null default '[]'::jsonb
);
create unique index if not exists televoting_combined_results_version_key
  on televoting.combined_televote_results(aggregation_id,country_code,calculation_version);

create table if not exists televoting.combined_televote_component_results (
  id uuid primary key default gen_random_uuid(),
  aggregation_id uuid not null references televoting.televote_aggregations(id) on delete cascade,
  component_id uuid not null references televoting.televote_aggregation_sources(id) on delete cascade,
  component_name text not null default '',
  component_type text not null default 'round',
  country_code text not null,
  calculation_version integer not null default 0,
  method text not null default 'rank_weighted',
  percentage_weight numeric not null default 0,
  component_pool integer not null default 0,
  raw_score numeric not null default 0,
  raw_rank integer,
  participant_count integer not null default 0,
  rank_base integer,
  rank_exponent numeric,
  rank_factor numeric,
  weighted_score numeric,
  source_weighted_total numeric,
  exact_allocation numeric not null default 0,
  floored_allocation integer not null default 0,
  decimal_remainder numeric not null default 0,
  remainder_bonus integer not null default 0,
  final_allocated_points integer not null default 0,
  tie_break_data jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (aggregation_id,component_id,country_code,calculation_version)
);
create index if not exists televoting_component_results_lookup
  on televoting.combined_televote_component_results(aggregation_id,calculation_version);

create or replace function televoting.round_entries_normalize()
returns trigger language plpgsql set search_path = televoting, pg_temp as $$
begin
  if new.entry_type = 'country' then
    new.entry_key := new.country_code;
  elsif tg_op = 'INSERT' then
    new.entry_key := coalesce(nullif(btrim(new.entry_key),''),'x_' || encode(gen_random_bytes(6),'hex'));
  else
    new.entry_key := old.entry_key;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists round_entries_normalize_trg on televoting.round_entries;
create trigger round_entries_normalize_trg before insert or update on televoting.round_entries
for each row execute function televoting.round_entries_normalize();

create or replace function televoting.round_entries_sync_countries()
returns trigger language plpgsql security definer set search_path = televoting, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.entry_type = 'country' then
      delete from televoting.round_countries where round_id=old.round_id and country_code=old.country_code;
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.entry_type='country' and (new.entry_type <> 'country' or new.country_code is distinct from old.country_code) then
    delete from televoting.round_countries where round_id=old.round_id and country_code=old.country_code;
  end if;
  if new.entry_type='country' then
    delete from televoting.round_countries where round_id=new.round_id and country_code<>new.country_code and display_order=new.display_order;
    insert into televoting.round_countries(round_id,country_code,display_order)
    values(new.round_id,new.country_code,new.display_order)
    on conflict(round_id,country_code) do update set display_order=excluded.display_order;
  end if;
  return new;
end $$;

drop trigger if exists round_entries_sync_countries_trg on televoting.round_entries;
create trigger round_entries_sync_countries_trg after insert or update or delete on televoting.round_entries
for each row execute function televoting.round_entries_sync_countries();

create or replace function televoting.flag_round_results_outdated()
returns trigger language plpgsql set search_path = televoting, pg_temp as $$
declare v_round uuid;
begin
  v_round := coalesce(new.round_id,old.round_id);
  update televoting.rounds set results_outdated=true where id=v_round and calculation_version>0;
  return coalesce(new,old);
end $$;

drop trigger if exists round_entries_flag_outdated on televoting.round_entries;
create trigger round_entries_flag_outdated after insert or update or delete on televoting.round_entries
for each row execute function televoting.flag_round_results_outdated();
drop trigger if exists round_countries_flag_outdated on televoting.round_countries;
create trigger round_countries_flag_outdated after insert or update or delete on televoting.round_countries
for each row execute function televoting.flag_round_results_outdated();

create or replace function televoting.flag_aggregation_outdated()
returns trigger language plpgsql set search_path = televoting, pg_temp as $$
declare v_agg uuid;
begin
  if tg_table_name='external_score_entries' then
    select s.aggregation_id into v_agg from televoting.televote_aggregation_sources s where s.id=coalesce(new.source_id,old.source_id);
  else
    v_agg := coalesce(new.aggregation_id,old.aggregation_id);
  end if;
  update televoting.televote_aggregations set results_outdated=true where id=v_agg and calculation_version>0;
  return coalesce(new,old);
end $$;

drop trigger if exists televoting_sources_outdated on televoting.televote_aggregation_sources;
create trigger televoting_sources_outdated after insert or update or delete on televoting.televote_aggregation_sources for each row execute function televoting.flag_aggregation_outdated();
drop trigger if exists televoting_entries_outdated on televoting.external_score_entries;
create trigger televoting_entries_outdated after insert or update or delete on televoting.external_score_entries for each row execute function televoting.flag_aggregation_outdated();
drop trigger if exists televoting_participants_outdated on televoting.televote_aggregation_participants;
create trigger televoting_participants_outdated after insert or update or delete on televoting.televote_aggregation_participants for each row execute function televoting.flag_aggregation_outdated();

drop trigger if exists televoting_editions_updated_at on televoting.editions;
create trigger televoting_editions_updated_at before update on televoting.editions for each row execute function televoting.update_updated_at_column();
drop trigger if exists televoting_rounds_updated_at on televoting.rounds;
create trigger televoting_rounds_updated_at before update on televoting.rounds for each row execute function televoting.update_updated_at_column();
drop trigger if exists televoting_round_results_updated_at on televoting.round_results;
create trigger televoting_round_results_updated_at before update on televoting.round_results for each row execute function televoting.update_updated_at_column();
drop trigger if exists televoting_aggregations_updated_at on televoting.televote_aggregations;
create trigger televoting_aggregations_updated_at before update on televoting.televote_aggregations for each row execute function televoting.update_updated_at_column();
drop trigger if exists televoting_sources_updated_at on televoting.televote_aggregation_sources;
create trigger televoting_sources_updated_at before update on televoting.televote_aggregation_sources for each row execute function televoting.update_updated_at_column();
drop trigger if exists televoting_external_entries_updated_at on televoting.external_score_entries;
create trigger televoting_external_entries_updated_at before update on televoting.external_score_entries for each row execute function televoting.update_updated_at_column();
drop trigger if exists televoting_combined_results_updated_at on televoting.combined_televote_results;
create trigger televoting_combined_results_updated_at before update on televoting.combined_televote_results for each row execute function televoting.update_updated_at_column();

create or replace function televoting.protect_audit_log()
returns trigger language plpgsql set search_path=televoting,pg_temp as $$
begin raise exception 'The audit log cannot be modified'; end $$;
drop trigger if exists televoting_admin_audit_no_update on televoting.admin_audit_log;
create trigger televoting_admin_audit_no_update before update or delete on televoting.admin_audit_log for each row execute function televoting.protect_audit_log();

create or replace function televoting.protect_moderation_events()
returns trigger language plpgsql set search_path=televoting,pg_temp as $$
begin raise exception 'Moderation history cannot be modified'; end $$;
drop trigger if exists televoting_vme_no_update on televoting.vote_moderation_events;
create trigger televoting_vme_no_update before update or delete on televoting.vote_moderation_events for each row execute function televoting.protect_moderation_events();

create or replace function televoting.submit_vote(
  p_round_id uuid,
  p_username text,
  p_country_code text,
  p_entries jsonb,
  p_ip_hash text default null,
  p_fingerprint_hash text default null,
  p_device_token_hash text default null,
  p_ip_country text default null,
  p_is_vpn boolean default false
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_round televoting.rounds%rowtype;
  v_username_norm text;
  v_total int := 0;
  v_entry jsonb;
  v_tc text;
  v_pts int;
  v_round_keys text[];
  v_seen text[] := array[]::text[];
  v_sub_id uuid;
  v_count int;
  v_home_exists boolean;
  v_risk int := 0;
  v_self_key text;
begin
  if p_username is null or length(trim(p_username))<2 then raise exception 'Username required' using errcode='22023'; end if;
  v_username_norm := lower(trim(p_username));
  select * into v_round from televoting.rounds where id=p_round_id;
  if not found then raise exception 'Round not found' using errcode='22023'; end if;
  if v_round.status<>'open' then raise exception 'Round is not open' using errcode='22023'; end if;
  select array_agg(entry_key) into v_round_keys from televoting.round_entries where round_id=p_round_id;
  if v_round_keys is null or array_length(v_round_keys,1)<2 then raise exception 'Round has no entries configured' using errcode='22023'; end if;
  select exists(select 1 from televoting.countries where code=p_country_code) into v_home_exists;
  if not v_home_exists then raise exception 'Unknown home country' using errcode='22023'; end if;
  if p_entries is null or jsonb_typeof(p_entries)<>'array' then raise exception 'Invalid entries payload' using errcode='22023'; end if;
  if coalesce(v_round.self_voting_mode,'country_match') in ('country_match','linked_identity','disabled') then
    select entry_key into v_self_key from televoting.round_entries where round_id=p_round_id and entry_type='country' and country_code=p_country_code;
  end if;
  if coalesce(v_round.self_voting_mode,'country_match')='unrestricted' then v_self_key:=null; end if;
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_tc:=v_entry->>'target_country_code';
    v_pts:=(v_entry->>'points')::int;
    if v_pts is null or v_pts<1 or v_pts>10 then raise exception 'Points must be 1-10' using errcode='22023'; end if;
    if v_self_key is not null and v_tc=v_self_key then
      insert into televoting.anti_abuse_events(round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,device_token_hash,reason,risk_score,metadata)
      values(p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,p_device_token_hash,'self_vote',80,jsonb_build_object('ip_country',p_ip_country,'is_vpn',p_is_vpn));
      raise exception 'Cannot vote for your own entry' using errcode='22023';
    end if;
    if not (v_tc=any(v_round_keys)) then raise exception 'Entry is not part of this round' using errcode='22023'; end if;
    if v_tc=any(v_seen) then raise exception 'Duplicate entry in ballot' using errcode='22023'; end if;
    v_seen:=v_seen||v_tc;
    v_total:=v_total+v_pts;
  end loop;
  v_count:=coalesce(array_length(v_seen,1),0);
  if v_total<>20 then
    insert into televoting.anti_abuse_events(round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,device_token_hash,reason,risk_score,metadata)
    values(p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,p_device_token_hash,'wrong_total_points',60,jsonb_build_object('total',v_total));
    raise exception 'Total must be exactly 20 points (got %)',v_total using errcode='22023';
  end if;
  if v_count<5 then
    insert into televoting.anti_abuse_events(round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,device_token_hash,reason,risk_score,metadata)
    values(p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,p_device_token_hash,'too_few_countries',50,jsonb_build_object('count',v_count));
    raise exception 'Vote at least 5 different entries' using errcode='22023';
  end if;
  if exists(select 1 from televoting.vote_submissions where round_id=p_round_id and username_normalized=v_username_norm and status<>'deleted') then raise exception 'You have already voted in this round' using errcode='23505'; end if;
  if p_ip_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and ip_hash=p_ip_hash and status<>'deleted') then raise exception 'A vote from this network was already recorded' using errcode='23505'; end if;
  if p_fingerprint_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and fingerprint_hash=p_fingerprint_hash and status<>'deleted') then raise exception 'A vote from this device was already recorded' using errcode='23505'; end if;
  if p_device_token_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and device_token_hash=p_device_token_hash and status<>'deleted') then raise exception 'A vote from this device was already recorded' using errcode='23505'; end if;
  if p_ip_country is not null and p_ip_country<>'' and upper(p_ip_country)<>upper(p_country_code) then v_risk:=v_risk+15; end if;
  if p_is_vpn then v_risk:=v_risk+40; end if;
  insert into televoting.vote_submissions(round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,device_token_hash,ip_country,is_vpn,risk_score,status)
  values(p_round_id,trim(p_username),v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,p_device_token_hash,p_ip_country,coalesce(p_is_vpn,false),v_risk,case when v_risk>=50 then 'suspicious' else 'active' end)
  returning id into v_sub_id;
  insert into televoting.vote_entries(submission_id,target_country_code,points)
  select v_sub_id,e->>'target_country_code',(e->>'points')::int from jsonb_array_elements(p_entries)e;
  if v_risk>=50 then
    insert into televoting.anti_abuse_events(round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,device_token_hash,reason,risk_score,metadata,status)
    values(p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,p_device_token_hash,case when p_is_vpn then 'vpn_or_proxy' else 'country_mismatch' end,v_risk,jsonb_build_object('ip_country',p_ip_country,'home_country',p_country_code,'is_vpn',p_is_vpn),'pending');
  end if;
  return jsonb_build_object('id',v_sub_id,'risk_score',v_risk);
end $$;

revoke all on function televoting.submit_vote(uuid,text,text,jsonb,text,text,text,text,boolean) from public;
grant execute on function televoting.submit_vote(uuid,text,text,jsonb,text,text,text,text,boolean) to anon,authenticated,service_role;

-- Seed only identity/presentation data from canonical Studio countries.
insert into televoting.countries(code,name,flag,flag_url)
select upper(short_code),name,'✦',flag_image from public.countries
where short_code is not null and btrim(short_code)<>''
on conflict(code) do update set name=excluded.name,flag_url=coalesce(excluded.flag_url,televoting.countries.flag_url);

alter table televoting.countries enable row level security;
alter table televoting.editions enable row level security;
alter table televoting.rounds enable row level security;
alter table televoting.round_countries enable row level security;
alter table televoting.round_entries enable row level security;
alter table televoting.vote_submissions enable row level security;
alter table televoting.vote_entries enable row level security;
alter table televoting.anti_abuse_events enable row level security;
alter table televoting.admin_audit_log enable row level security;
alter table televoting.vote_moderation_events enable row level security;
alter table televoting.round_results enable row level security;
alter table televoting.televote_aggregations enable row level security;
alter table televoting.televote_aggregation_participants enable row level security;
alter table televoting.televote_aggregation_sources enable row level security;
alter table televoting.external_score_entries enable row level security;
alter table televoting.external_score_entry_log enable row level security;
alter table televoting.combined_televote_results enable row level security;
alter table televoting.combined_televote_component_results enable row level security;

grant select on televoting.countries,televoting.editions,televoting.rounds,televoting.round_countries,televoting.round_entries to anon,authenticated;
grant select on televoting.round_results,televoting.televote_aggregations,televoting.televote_aggregation_participants,televoting.combined_televote_results,televoting.combined_televote_component_results to anon,authenticated;
grant all on all tables in schema televoting to service_role;
grant all on all sequences in schema televoting to service_role;
grant execute on all functions in schema televoting to service_role;

create policy "televoting public countries" on televoting.countries for select to anon,authenticated using(true);
create policy "televoting public editions" on televoting.editions for select to anon,authenticated using(true);
create policy "televoting public rounds" on televoting.rounds for select to anon,authenticated using(true);
create policy "televoting public round countries" on televoting.round_countries for select to anon,authenticated using(true);
create policy "televoting public round entries" on televoting.round_entries for select to anon,authenticated using(true);
create policy "televoting public published round results" on televoting.round_results for select to anon,authenticated using(exists(select 1 from televoting.rounds r where r.id=round_results.round_id and r.results_status='published'));
create policy "televoting public published aggregations" on televoting.televote_aggregations for select to anon,authenticated using(status='published');
create policy "televoting public published aggregation participants" on televoting.televote_aggregation_participants for select to anon,authenticated using(exists(select 1 from televoting.televote_aggregations a where a.id=aggregation_id and a.status='published'));
create policy "televoting public published combined results" on televoting.combined_televote_results for select to anon,authenticated using(exists(select 1 from televoting.televote_aggregations a where a.id=aggregation_id and a.status='published'));
create policy "televoting public published component results" on televoting.combined_televote_component_results for select to anon,authenticated using(exists(select 1 from televoting.televote_aggregations a where a.id=aggregation_id and a.status='published'));

alter table televoting.rounds replica identity full;
alter table televoting.round_countries replica identity full;
alter table televoting.round_entries replica identity full;
alter table televoting.vote_submissions replica identity full;
alter table televoting.vote_entries replica identity full;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='televoting' and tablename='rounds') then alter publication supabase_realtime add table televoting.rounds; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='televoting' and tablename='round_countries') then alter publication supabase_realtime add table televoting.round_countries; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='televoting' and tablename='round_entries') then alter publication supabase_realtime add table televoting.round_entries; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='televoting' and tablename='vote_submissions') then alter publication supabase_realtime add table televoting.vote_submissions; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='televoting' and tablename='vote_entries') then alter publication supabase_realtime add table televoting.vote_entries; end if;
end $$;

notify pgrst,'reload schema';
