begin;

-- Preserve every existing calculation as v1, while making robust v2 the
-- default engine for newly-created rounds after this migration.
alter table televoting.rounds
  add column if not exists televote_engine_version text not null default 'rank-weighted-v1',
  add column if not exists ballot_exponent numeric not null default 0.75,
  add column if not exists breadth_floor numeric not null default 0.75,
  add column if not exists breadth_exponent numeric not null default 0.50,
  add column if not exists support_exponent numeric not null default 1.20,
  add column if not exists rank_boost_strength numeric not null default 0.80,
  add column if not exists rank_boost_shape numeric not null default 1.30;

alter table televoting.rounds
  alter column televote_engine_version set default 'robust-televote-v2';

-- v1 rows need the legacy rank columns; v2 stores explicit robust fields and
-- leaves legacy-only fields nullable rather than giving them misleading values.
alter table televoting.round_results
  alter column original_rank drop not null,
  alter column rank_base drop not null,
  alter column rank_exponent drop not null,
  alter column rank_factor drop not null;

alter table televoting.round_results
  add column if not exists engine_version text not null default 'rank-weighted-v1',
  add column if not exists effective_points numeric,
  add column if not exists supporter_count integer,
  add column if not exists effective_supporters numeric,
  add column if not exists breadth_ratio numeric,
  add column if not exists breadth_factor numeric,
  add column if not exists robust_support numeric,
  add column if not exists robust_rank integer,
  add column if not exists rank_percentile numeric,
  add column if not exists rank_boost numeric,
  add column if not exists calculation_config jsonb not null default '{}'::jsonb;

-- Counterfactual result-stability snapshots are organizer-only evidence. They
-- never automatically invalidate a ballot.
create table if not exists televoting.round_influence_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  calculation_version integer not null,
  subject_type text not null check (subject_type in ('voter','cluster')),
  subject_key text not null,
  members jsonb not null default '[]'::jsonb,
  winner_changed boolean not null default false,
  top_three_changed boolean not null default false,
  qualifier_changed boolean not null default false,
  max_rank_movement integer not null default 0,
  max_point_movement integer not null default 0,
  most_affected_entry text,
  created_at timestamptz not null default now(),
  unique (round_id, calculation_version, subject_type, subject_key)
);
create index if not exists televoting_round_influence_round_idx
  on televoting.round_influence_results(round_id, calculation_version);
alter table televoting.round_influence_results enable row level security;
revoke all on table televoting.round_influence_results from anon, authenticated;

-- Store the richer v4 preflight output without exposing detector thresholds to
-- the voter-facing client.
alter table televoting.vote_preflight_checks
  add column if not exists model_version text not null default 'friend-voting-model-v3',
  add column if not exists confidence integer not null default 0,
  add column if not exists intervention_level text not null default 'none',
  add column if not exists voter_reason_categories jsonb not null default '[]'::jsonb,
  add column if not exists admin_evidence jsonb not null default '{}'::jsonb;

do $$ begin
  alter table televoting.vote_preflight_checks
    add constraint vote_preflight_checks_intervention_check
    check (intervention_level in ('none','notice','review','declaration','enhanced_declaration','provisional_review'));
exception when duplicate_object then null;
end $$;

commit;
