begin;

-- WORLD-05 TG8. This migration is intentionally stacked on #2039 and also
-- requires TG7 #1985; neither has been deployed or certified as of authoring.
-- It does NOT implement secret elections, seat elections, or session roll call.
-- Never turn the rollout flag on until schema, RLS and isolated rehearsal pass.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg8.legislative-vote-lifecycle',1,'forward_fix_only',false,null,
      'Frozen institutional legislative electorate, one immutable recorded choice per country, exact-rational certified tally and publication-safe result. Secret election deliberately unsupported.'
    );
  end if;
end $contract$;


-- A distinct, permanently default-disabled rollout gate prevents #2039
-- settings availability from accidentally activating official ballot mutations.
do $vote_rollout$
declare v_predicate text;
begin
  select pg_catalog.pg_get_expr(c.conbin,c.conrelid) into v_predicate
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  where ns.nspname='public' and t.relname='studio2_feature_flags'
    and c.conname='studio2_feature_flags_key_check' and c.contype='c';
  if v_predicate is null then
    raise exception using errcode='23514',message='VOTING_ROLLOUT_CONSTRAINT_MISSING';
  end if;
  if pg_catalog.strpos(v_predicate,'terra_world_legislative_voting')=0 then
    alter table public.studio2_feature_flags
      drop constraint studio2_feature_flags_key_check;
    execute pg_catalog.format(
      'alter table public.studio2_feature_flags add constraint studio2_feature_flags_key_check check ((%s) or key = %L)',
      v_predicate,'terra_world_legislative_voting'
    );
  end if;
end $vote_rollout$;

insert into public.studio2_feature_flags
  (key,enabled,admins_only,user_ids,edition_ids)
values ('terra_world_legislative_voting',false,false,'{}'::uuid[],'{}'::uuid[])
on conflict(key) do nothing;

insert into public.studio2_capabilities(key,domain,label,description,access_level)
values
  ('world.vote.open','world','Open an institutional vote','Open a versioned measure for a governed legislative vote.','approve'),
  ('world.vote.certify','world','Certify institutional vote','Certify a frozen electorate and exact-rational result after close.','approve'),
  ('world.vote.cast','world','Cast institutional ballot','Cast once for an effective authorized representation or approved frozen proxy.','operate')
on conflict(key) do nothing;

-- Seed authority as data; office titles remain descriptive, never the runtime
-- authorization decision. More office capabilities can be governed separately.
insert into public.world_office_capabilities(office_id,capability)
select office_row.id,cap.capability
from public.world_organization_offices office_row
join public.world_organizations org on org.id=office_row.organization_id
join (values
  ('guard','chairperson','world.vote.open'),
  ('guard','chairperson','world.vote.certify'),
  ('unity','secretary-general','world.vote.open'),
  ('unity','secretary-general','world.vote.certify')
) cap(org_slug,office_slug,capability)
  on cap.org_slug=org.slug and cap.office_slug=office_row.slug
on conflict do nothing;

create table public.world_votes (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid not null references public.world_organization_organs(id) on delete restrict,
  measure_id uuid not null references public.world_measures(id) on delete restrict,
  measure_version_id uuid not null references public.world_measure_versions(id) on delete restrict,
  rule_id uuid not null references public.world_voting_rules(id) on delete restrict,
  rule_snapshot jsonb not null,
  electorate_count bigint not null,
  opened_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open',
  revision bigint not null default 1,
  open_operation_id uuid not null unique,
  certified_at timestamptz,
  certified_by uuid,
  created_at timestamptz not null default now(),
  constraint world_vote_period_check check (closes_at > opened_at),
  constraint world_vote_status_check check (status in ('open','certified')),
  constraint world_vote_revision_check check (revision >= 1),
  constraint world_vote_eligibility_count_check check (electorate_count between 1 and 200),
  constraint world_vote_certification_pair_check check (
    (status='open' and certified_at is null and certified_by is null)
    or (status='certified' and certified_at is not null and certified_by is not null)
  ),
  constraint world_vote_rule_snapshot_check check (
    jsonb_typeof(rule_snapshot)='object'
    and rule_snapshot ? 'ruleId' and rule_snapshot ? 'ruleRevision'
    and rule_snapshot ? 'quorumNumerator' and rule_snapshot ? 'thresholdKind'
  )
);
create unique index world_votes_one_open_measure_uidx
  on public.world_votes(measure_id) where status='open';
create index world_votes_org_date_idx on public.world_votes(organization_id,opened_at desc);

-- Membership/repr/proxy versions at the instant the vote was opened.
-- Auth user IDs intentionally absent from the public electorate history.
create table public.world_vote_eligibility (
  vote_id uuid not null references public.world_votes(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  membership_id uuid not null references public.world_organization_memberships(id) on delete restrict,
  membership_revision bigint not null,
  representation_id uuid not null references public.world_organization_representations(id) on delete restrict,
  representation_revision bigint not null,
  representative_person_id uuid not null references public.delegation_people(id) on delete restrict,
  proxy_id uuid references public.world_representation_proxies(id) on delete restrict,
  proxy_revision bigint,
  eligible boolean not null default true,
  reason text,
  snapshotted_at timestamptz not null,
  primary key(vote_id,country_id),
  unique(vote_id,country_id,representation_id),
  constraint world_vote_proxy_revision_pair_check check ((proxy_id is null)=(proxy_revision is null)),
  constraint world_vote_eligibility_version_check check (
    membership_revision>=1 and representation_revision>=1 and
    (proxy_revision is null or proxy_revision>=1)
  )
);
create index world_vote_eligibility_country_idx on public.world_vote_eligibility(country_id,vote_id);

-- A private ballot MUST NOT be a public world_vote_eligibility column.
-- This table is for recorded legislative votes ONLY, never secret elections.
create table private.world_ballots (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  vote_id uuid not null references public.world_votes(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  representation_id uuid not null references public.world_organization_representations(id)
    on delete restrict,
  choice text not null check (choice in ('aye','nay','abstain')),
  cast_by_user_id uuid not null,
  cast_by_proxy_id uuid references public.world_representation_proxies(id) on delete restrict,
  operation_id uuid not null unique,
  receipt_id uuid not null references public.studio2_operation_receipts(operation_id)
    on delete restrict,
  cast_at timestamptz not null default now(),
  unique(vote_id,country_id),
  foreign key(vote_id,country_id,representation_id)
    references public.world_vote_eligibility(vote_id,country_id,representation_id) on delete restrict
);
create index world_ballots_vote_idx
  on private.world_ballots(vote_id,choice);

-- Certification is a separate immutable object, not the latest browser tally.
create table public.world_vote_results (
  vote_id uuid primary key references public.world_votes(id) on delete restrict,
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  measure_id uuid not null references public.world_measures(id) on delete restrict,
  result_snapshot jsonb not null,
  rule_snapshot jsonb not null,
  electorate_count bigint not null,
  valid_ballot_count bigint not null,
  aye_count bigint not null,
  nay_count bigint not null,
  abstain_count bigint not null,
  quorum_met boolean not null,
  threshold_met boolean not null,
  outcome text not null check(outcome in ('passed','failed','no_quorum')),
  certified_by uuid not null,
  certified_at timestamptz not null,
  certification_operation_id uuid not null unique,
  result_hash text not null,
  constraint world_vote_results_count_check check (
    electorate_count>0 and valid_ballot_count between 0 and electorate_count
    and aye_count>=0 and nay_count>=0 and abstain_count>=0
    and aye_count+nay_count+abstain_count=valid_ballot_count
  ),
  constraint world_vote_results_hash_check check (result_hash ~ '^[0-9a-f]{64}$')
);

alter table public.world_votes enable row level security;
alter table public.world_vote_eligibility enable row level security;
alter table private.world_ballots enable row level security;
alter table public.world_vote_results enable row level security;
revoke all on public.world_votes,public.world_vote_eligibility,
  public.world_vote_results from public,anon,authenticated,service_role;
revoke all on private.world_ballots from public,anon,authenticated,service_role;

-- Belt-and-suspenders append-only safeguards on critical historical evidence.
create or replace function private.world_vote_immutable_row_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $immutable$
begin
  raise exception using errcode='23514',message='IMMUTABLE_WORLD_VOTE_EVIDENCE';
end $immutable$;
create trigger world_vote_eligibility_immutable
  before update or delete on public.world_vote_eligibility
  for each row execute function private.world_vote_immutable_row_v1();
create trigger world_legislative_ballot_immutable
  before update or delete on private.world_ballots
  for each row execute function private.world_vote_immutable_row_v1();
create trigger world_vote_result_immutable
  before update or delete on public.world_vote_results
  for each row execute function private.world_vote_immutable_row_v1();
revoke all on function private.world_vote_immutable_row_v1()
  from public,anon,authenticated,service_role;

-- Parent vote is mutable ONLY for one-way certification. Its frozen rule,
-- electorate and referential context may never be replaced.
create or replace function private.world_vote_certification_guard_v1()
returns trigger language plpgsql set search_path=pg_catalog
as $vote_guard$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',message='WORLD_VOTE_IMMUTABLE';
  end if;
  if old.status<>'open' or new.status<>'certified'
     or new.revision<>old.revision+1
     or new.certified_at is null or new.certified_by is null
     or (to_jsonb(new)-'status'-'revision'-'certified_at'-'certified_by')
        is distinct from (to_jsonb(old)-'status'-'revision'-'certified_at'-'certified_by')
  then
    raise exception using errcode='23514',message='WORLD_VOTE_IMMUTABLE';
  end if;
  return new;
end $vote_guard$;
create trigger world_vote_certification_guard
  before update or delete on public.world_votes
  for each row execute function private.world_vote_certification_guard_v1();
revoke all on function private.world_vote_certification_guard_v1()
  from public,anon,authenticated,service_role;

commit;
