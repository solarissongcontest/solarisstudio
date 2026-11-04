begin;

-- Keep this newly authored settings page OFF until TG8 migrations and
-- authorization are certified. Preserve the current feature-key predicate:
-- other V3 workers may have extended it in either migration ordering.
do $voting_rules_rollout$
declare
  v_predicate text;
begin
  select pg_catalog.pg_get_expr(c.conbin,c.conrelid)
  into v_predicate
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  where ns.nspname='public'
    and t.relname='studio2_feature_flags'
    and c.conname='studio2_feature_flags_key_check'
    and c.contype='c';

  if v_predicate is null then
    raise exception 'TG8_VOTING_RULE_ROLLOUT_CONSTRAINT_MISSING'
      using errcode='23514';
  end if;
  if pg_catalog.strpos(v_predicate,'terra_world_voting_rules')=0 then
    alter table public.studio2_feature_flags
      drop constraint studio2_feature_flags_key_check;
    execute pg_catalog.format(
      'alter table public.studio2_feature_flags add constraint studio2_feature_flags_key_check check ((%s) or key = %L)',
      v_predicate,'terra_world_voting_rules'
    );
  end if;
end
$voting_rules_rollout$;

insert into public.studio2_feature_flags
  (key,enabled,admins_only,user_ids,edition_ids)
values ('terra_world_voting_rules',false,false,'{}'::uuid[],'{}'::uuid[])
on conflict (key) do nothing;

-- TG8: institutional voting rule authority. The tally itself belongs to the
-- separate TG8 exact-rational helper PR #2031. This foundation does NOT open a
-- vote, snapshot electorate, issue ballots, certify results or publish choices.
create table public.world_voting_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  key text not null,
  label text not null,
  ballot_type text not null,
  secrecy text not null,
  quorum_numerator bigint not null,
  quorum_denominator bigint not null,
  threshold_kind text not null,
  threshold_numerator bigint,
  threshold_denominator bigint,
  denominator_policy text not null,
  abstention_allowed boolean not null,
  ballot_change_policy text not null,
  publication_mode text not null,
  tie_policy text not null,
  active boolean not null default true,
  revision bigint not null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint world_voting_rules_key_check
    check (key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  constraint world_voting_rules_label_check
    check (length(btrim(label)) between 1 and 160),
  constraint world_voting_rules_ballot_type_check
    check (ballot_type in ('recorded_roll_call','restricted_roll_call','aggregate_only','secret_election')),
  constraint world_voting_rules_secrecy_check
    check (secrecy in ('public','restricted','aggregate','secret')),
  constraint world_voting_rules_ballot_secrecy_check
    check (
      (ballot_type='recorded_roll_call' and secrecy='public')
      or (ballot_type='restricted_roll_call' and secrecy='restricted')
      or (ballot_type='aggregate_only' and secrecy='aggregate')
      or (ballot_type='secret_election' and secrecy='secret')
    ),
  constraint world_voting_rules_quorum_check
    check (quorum_numerator > 0 and quorum_denominator > 0
      and quorum_numerator <= quorum_denominator),
  constraint world_voting_rules_threshold_check
    check (
      threshold_kind in ('simple_majority','fraction','unanimity')
      and (
        (threshold_kind='fraction'
          and threshold_numerator is not null
          and threshold_denominator is not null
          and threshold_numerator > 0
          and threshold_denominator > 0
          and threshold_numerator <= threshold_denominator)
        or (threshold_kind <> 'fraction'
          and threshold_numerator is null and threshold_denominator is null)
      )
    ),
  constraint world_voting_rules_denominator_check
    check (denominator_policy='all_cast_including_abstentions'),
  constraint world_voting_rules_abstention_check
    check (abstention_allowed),
  constraint world_voting_rules_ballot_change_check
    check (ballot_change_policy='locked_after_cast'),
  constraint world_voting_rules_publication_check
    check (publication_mode in ('after_certification','aggregate_after_certification','withheld')),
  constraint world_voting_rules_tie_check
    check (tie_policy in ('no_passage','manual_review')),
  constraint world_voting_rules_revision_check check (revision >= 1),
  constraint world_voting_rules_superseded_check
    check (
      (active and superseded_at is null)
      or (not active and superseded_at is not null)
    ),
  unique (organization_id,key,revision)
);
create unique index world_voting_rules_one_active_version_uidx
  on public.world_voting_rules(organization_id,key) where active;
create index world_voting_rules_history_idx
  on public.world_voting_rules(organization_id,key,revision desc);

alter table public.world_voting_rules enable row level security;
revoke all on public.world_voting_rules from public,anon,authenticated,service_role;
grant all on public.world_voting_rules to service_role;

-- Even privileged accidental UPDATE/DELETE cannot alter historical rule
-- semantics. Canonical configuration only deactivates its predecessor.
create or replace function private.world_voting_rule_history_guard_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog
as $guard$
begin
  if tg_op='DELETE' then
    raise exception using errcode='23514',message='VOTING_RULE_HISTORY_IMMUTABLE';
  end if;
  if old.active is not true or new.active is not false
     or new.superseded_at is null
     or (to_jsonb(new) - 'active' - 'superseded_at')
        is distinct from (to_jsonb(old) - 'active' - 'superseded_at')
  then
    raise exception using errcode='23514',message='VOTING_RULE_HISTORY_IMMUTABLE';
  end if;
  return new;
end
$guard$;

create trigger world_voting_rules_history_guard
before update or delete on public.world_voting_rules
for each row execute function private.world_voting_rule_history_guard_v1();

revoke all on function private.world_voting_rule_history_guard_v1()
  from public,anon,authenticated;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg8.world-versioned-voting-policy',
      1,'forward_fix_only',false,null,
      'World institution voting rule versions use exact quorum/threshold fractions and explicit denominator/ballot/privacy policies; changes are receipt-bound, old versions immutable, future vote-open authority must freeze a trusted server snapshot.'
    );
  end if;
end
$contract$;

-- Editor command for organization settings authority. A recorded/aggregate
-- legislative rule is supported. Secret-election rule configuration remains
-- denied until isolated secret-ballot and constitutional winner mechanics exist.
create or replace function public.world_configure_voting_rule_v1(
  p_organization_id uuid,
  p_key text,
  p_label text,
  p_ballot_type text,
  p_secrecy text,
  p_quorum_numerator bigint,
  p_quorum_denominator bigint,
  p_threshold_kind text,
  p_threshold_numerator bigint,
  p_threshold_denominator bigint,
  p_denominator_policy text,
  p_abstention_allowed boolean,
  p_ballot_change_policy text,
  p_publication_mode text,
  p_tie_policy text,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $configure$
declare
  v_org public.world_organizations%rowtype;
  v_prior public.world_voting_rules%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_new_id uuid;
  v_revision bigint;
  v_result jsonb;
  v_key text := lower(btrim(coalesce(p_key,'')));
  v_label text := btrim(coalesce(p_label,''));
begin
  if auth.uid() is null or p_organization_id is null
     or p_operation_id is null or p_idempotency_key is null
     or not public.world_access_allowed(
       'world.organization.settings.manage',
       p_organization_id,null,null,null,null
     )
  then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  if v_key !~ '^[a-z][a-z0-9_.-]{0,79}$'
     or length(v_label) not between 1 and 160
     or p_ballot_type not in ('recorded_roll_call','restricted_roll_call','aggregate_only')
     or p_ballot_type is null
     or p_secrecy is null
     or not (
       (p_ballot_type='recorded_roll_call' and p_secrecy='public')
       or (p_ballot_type='restricted_roll_call' and p_secrecy='restricted')
       or (p_ballot_type='aggregate_only' and p_secrecy='aggregate')
     )
     or p_quorum_numerator is null or p_quorum_denominator is null
     or p_quorum_numerator <= 0 or p_quorum_denominator <= 0
     or p_quorum_numerator > p_quorum_denominator
     or p_threshold_kind is null
     or p_threshold_kind not in ('simple_majority','fraction','unanimity')
     or not (
       (p_threshold_kind='fraction'
        and p_threshold_numerator is not null
        and p_threshold_denominator is not null
        and p_threshold_numerator > 0
        and p_threshold_denominator > 0
        and p_threshold_numerator <= p_threshold_denominator)
       or (p_threshold_kind<>'fraction'
        and p_threshold_numerator is null
        and p_threshold_denominator is null)
     )
     or p_denominator_policy is distinct from 'all_cast_including_abstentions'
     or p_abstention_allowed is distinct from true
     or p_ballot_change_policy is distinct from 'locked_after_cast'
     or p_publication_mode not in ('after_certification','aggregate_after_certification','withheld')
     or p_publication_mode is null
     or p_tie_policy not in ('no_passage','manual_review')
     or p_tie_policy is null
  then
    raise exception using errcode='22023',message='UNSUPPORTED_VOTING_RULE';
  end if;

  -- Lock one canonical organization before allocating any rule revision.
  -- Concurrent writers cannot both create revision 1 or both supersede a row.
  select * into v_org from public.world_organizations
  where id=p_organization_id for update;
  if v_org.id is null then
    raise exception using errcode='42501',message='AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.voting_rule.configure','R2',
    jsonb_build_object('organizationId',p_organization_id,
      'ruleKey',v_key,'subjectType','world_voting_rule'),
    jsonb_build_object(
      'label',v_label,'ballotType',p_ballot_type,'secrecy',p_secrecy,
      'quorumNumerator',p_quorum_numerator,'quorumDenominator',p_quorum_denominator,
      'thresholdKind',p_threshold_kind,'thresholdNumerator',p_threshold_numerator,
      'thresholdDenominator',p_threshold_denominator,
      'denominatorPolicy',p_denominator_policy,'abstentionAllowed',p_abstention_allowed,
      'ballotChangePolicy',p_ballot_change_policy,'publicationMode',p_publication_mode,
      'tiePolicy',p_tie_policy,'expectedRevision',p_expected_revision
    )
  );
  v_operation_id := (v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed',true);
  end if;

  if v_org.status <> 'active' then
    raise exception using errcode='23514',message='ORGANIZATION_INACTIVE';
  end if;

  select * into v_prior from public.world_voting_rules
  where organization_id=p_organization_id and key=v_key and active
  for update;
  if coalesce(v_prior.revision,0) is distinct from p_expected_revision then
    raise exception using errcode='40001',message='VERSION_CONFLICT';
  end if;
  select coalesce(max(revision),0)+1 into v_revision
  from public.world_voting_rules
  where organization_id=p_organization_id and key=v_key;

  if v_prior.id is not null then
    update public.world_voting_rules
    set active=false,superseded_at=now()
    where id=v_prior.id;
  end if;

  insert into public.world_voting_rules(
    organization_id,key,label,ballot_type,secrecy,
    quorum_numerator,quorum_denominator,
    threshold_kind,threshold_numerator,threshold_denominator,
    denominator_policy,abstention_allowed,ballot_change_policy,
    publication_mode,tie_policy,active,revision
  ) values (
    p_organization_id,v_key,v_label,p_ballot_type,p_secrecy,
    p_quorum_numerator,p_quorum_denominator,
    p_threshold_kind,p_threshold_numerator,p_threshold_denominator,
    p_denominator_policy,p_abstention_allowed,p_ballot_change_policy,
    p_publication_mode,p_tie_policy,true,v_revision
  ) returning id into v_new_id;

  perform private.v3_emit_domain_event(
    'world.voting_rule.revised','world_voting_rule',v_new_id::text,
    v_revision,v_operation_id,null,null,
    jsonb_build_object('ruleId',v_new_id,'organizationId',p_organization_id,
      'ruleKey',v_key,'revision',v_revision),
    1,array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok',true,'ruleId',v_new_id,'organizationId',p_organization_id,
    'ruleKey',v_key,'revision',v_revision,'operationId',v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed',false);
end
$configure$;

-- Future vote-open RPC calls this server-only builder while holding the
-- selected rule and electoral snapshot locks. Never accept a client-authored
-- rule JSON as the frozen voting policy.
create or replace function private.world_voting_rule_snapshot_v1(p_rule_id uuid)
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $snapshot$
  select jsonb_build_object(
    'ruleId',rule_row.id,'organizationId',rule_row.organization_id,
    'ruleKey',rule_row.key,'ruleRevision',rule_row.revision,
    'ballotType',rule_row.ballot_type,'secrecy',rule_row.secrecy,
    'quorumNumerator',rule_row.quorum_numerator,
    'quorumDenominator',rule_row.quorum_denominator,
    'thresholdKind',rule_row.threshold_kind,
    'thresholdNumerator',rule_row.threshold_numerator,
    'thresholdDenominator',rule_row.threshold_denominator,
    'denominatorPolicy',rule_row.denominator_policy,
    'abstentionAllowed',rule_row.abstention_allowed,
    'ballotChangePolicy',rule_row.ballot_change_policy,
    'publicationMode',rule_row.publication_mode,
    'tiePolicy',rule_row.tie_policy,
    'snapshottedAt',now()
  )
  from public.world_voting_rules rule_row
  where rule_row.id=p_rule_id and rule_row.active
$snapshot$;

-- Only deliberately public institutions have a public ACTIVE policy lookup.
-- The internal immutable history and all unpublished organization policy
-- records are not browser-readable.
create or replace function public.world_public_voting_rule_v1(
  p_organization_slug text,p_rule_key text
)
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $published$
  select jsonb_build_object(
    'organizationSlug',org.slug,
    'ruleKey',rule_row.key,
    'label',rule_row.label,
    'ballotType',rule_row.ballot_type,
    'secrecy',rule_row.secrecy,
    'quorumNumerator',rule_row.quorum_numerator::text,
    'quorumDenominator',rule_row.quorum_denominator::text,
    'thresholdKind',rule_row.threshold_kind,
    'thresholdNumerator',rule_row.threshold_numerator::text,
    'thresholdDenominator',rule_row.threshold_denominator::text,
    'denominatorPolicy',rule_row.denominator_policy,
    'abstentionAllowed',rule_row.abstention_allowed,
    'ballotChangePolicy',rule_row.ballot_change_policy,
    'publicationMode',rule_row.publication_mode,
    'tiePolicy',rule_row.tie_policy,
    'revision',rule_row.revision
  )
  from public.world_voting_rules rule_row
  join public.world_organizations org on org.id=rule_row.organization_id
  where org.slug=lower(btrim(p_organization_slug))
    and coalesce(
      public.studio2_feature_enabled('terra_world_voting_rules',null),false
    )
    and org.public_visibility='public'
    and org.status='active'
    and rule_row.key=lower(btrim(p_rule_key))
    and rule_row.active
$published$;

-- Manager organization chooser is constrained to the caller's actual
-- per-organization settings capability, including private institutions; the
-- browser cannot infer private institutions from the public World directory.
create or replace function public.world_managed_voting_organizations_v1()
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $managed_orgs$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',org.id,'slug',org.slug,'name',org.short_name
  ) order by org.short_name,org.id),'[]'::jsonb)
  from (
    select o.id,o.slug,o.short_name
    from public.world_organizations o
    where o.status='active'
      and auth.uid() is not null
      and public.world_access_allowed(
        'world.organization.settings.manage',o.id,null,null,null,null
      )
    order by o.short_name,o.id
    limit 30
  ) org
$managed_orgs$;

-- Read-only management projection, one current rule per key. Exact fractions
-- are serialized as strings to avoid bigint precision loss in JS. Superseded
-- history remains queryable only to platform authorities (not via this API).
create or replace function public.world_voting_rules_manage_v1(p_organization_id uuid)
returns jsonb language sql stable security definer
set search_path=pg_catalog
as $manage_rules$
  select case when p_organization_id is null
    or auth.uid() is null
    or not public.world_access_allowed(
      'world.organization.settings.manage',
      p_organization_id,null,null,null,null
    )
    or not exists (
      select 1 from public.world_organizations org
      where org.id=p_organization_id and org.status='active'
    )
    then null
    else jsonb_build_object(
      'organizationId',p_organization_id,
      'rules',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',r.id,'key',r.key,'label',r.label,
          'ballotType',r.ballot_type,'secrecy',r.secrecy,
          'quorumNumerator',r.quorum_numerator::text,
          'quorumDenominator',r.quorum_denominator::text,
          'thresholdKind',r.threshold_kind,
          'thresholdNumerator',r.threshold_numerator::text,
          'thresholdDenominator',r.threshold_denominator::text,
          'denominatorPolicy',r.denominator_policy,
          'abstentionAllowed',r.abstention_allowed,
          'ballotChangePolicy',r.ballot_change_policy,
          'publicationMode',r.publication_mode,'tiePolicy',r.tie_policy,
          'revision',r.revision::text
        ) order by r.key)
        from (
          select rule_row.*
          from public.world_voting_rules rule_row
          where rule_row.organization_id=p_organization_id
            and rule_row.active
          order by rule_row.key
          limit 30
        ) r
      ),'[]'::jsonb)
    )
  end
$manage_rules$;

revoke all on function public.world_managed_voting_organizations_v1()
  from public,anon,authenticated;
grant execute on function public.world_managed_voting_organizations_v1()
  to authenticated,service_role;
revoke all on function public.world_voting_rules_manage_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.world_voting_rules_manage_v1(uuid)
  to authenticated,service_role;

comment on function public.world_managed_voting_organizations_v1() is
  'TG8 up to 30 actual institutions manageable through exact world.organization.settings.manage scope; includes private institutions only to authorized staff.';
comment on function public.world_voting_rules_manage_v1(uuid) is
  'TG8 at most 30 active configured voting rules for a verified institution settings editor; exact fractions as strings; no raw rule history, ballots, electorate or identity linkage.';

revoke all on function public.world_configure_voting_rule_v1(
  uuid,text,text,text,text,bigint,bigint,text,bigint,bigint,
  text,boolean,text,text,text,bigint,uuid,text,uuid
) from public,anon,authenticated;
grant execute on function public.world_configure_voting_rule_v1(
  uuid,text,text,text,text,bigint,bigint,text,bigint,bigint,
  text,boolean,text,text,text,bigint,uuid,text,uuid
) to authenticated,service_role;

revoke all on function private.world_voting_rule_snapshot_v1(uuid)
  from public,anon,authenticated,service_role;

revoke all on function public.world_public_voting_rule_v1(text,text)
  from public,anon,authenticated;
grant execute on function public.world_public_voting_rule_v1(text,text)
  to anon,authenticated,service_role;

comment on table public.world_voting_rules is
  'TG8 immutable versioned institutional rules; active version configured only by R2 authority. Old revisions remain durable while official vote openings freeze server-built snapshots.';
comment on function private.world_voting_rule_snapshot_v1(uuid) is
  'TG8 private server-only snapshot for future vote-opening commands; an active rule version and legitimate frozen electorate are required before any vote may open.';
comment on function public.world_public_voting_rule_v1(text,text) is
  'Published policy metadata for an active public institution only; returns exact fractions as strings to avoid JavaScript precision loss. Never exposes private draft votes or ballots.';

notify pgrst,'reload schema';
commit;
