begin;

-- V3 / O7 current-main VotingConfig authority. Keep shows.voting_config as the
-- single compatibility/scoring truth while adding exact version/history,
-- evidence freeze, receipted Organizer mutation and future Result provenance.
select public.v3_register_migration_contract(
  'v3.voting.configuration-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Version canonical show VotingConfig, freeze it after official voting/outcome evidence, govern Organizer writes and bind future Result calculations to the exact config version.'
);

create table if not exists private.v3_voting_config_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists private.v3_voting_config_history (
  show_id uuid not null references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null check (version >= 1),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  changed_at timestamptz not null default now(),
  changed_by uuid,
  operation_id uuid,
  reason text,
  primary key (show_id, version)
);

create index if not exists v3_voting_config_history_edition_idx
  on private.v3_voting_config_history (edition_id, changed_at desc);

revoke all on table private.v3_voting_config_versions from public, anon, authenticated;
revoke all on table private.v3_voting_config_history from public, anon, authenticated;
grant select on table private.v3_voting_config_versions to service_role;
grant select on table private.v3_voting_config_history to service_role;

create or replace function private.v3_assert_voting_config_shape(p_config jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $validate$
declare
  v_value jsonb;
  v_number numeric;
  v_text text;
  v_seen text[];
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  if p_config ? 'juryEnabled' and jsonb_typeof(p_config -> 'juryEnabled') <> 'boolean' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_config ? 'televoteEnabled' and jsonb_typeof(p_config -> 'televoteEnabled') <> 'boolean' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_config ? 'weightedScoring' and jsonb_typeof(p_config -> 'weightedScoring') <> 'boolean' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_config ? 'allowSelfVote' and jsonb_typeof(p_config -> 'allowSelfVote') <> 'boolean' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_config ? 'televoteMode'
     and coalesce(p_config ->> 'televoteMode', '') not in ('scale', 'total') then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  foreach v_text in array array['juryPoints','televotePoints'] loop
    if p_config ? v_text then
      if jsonb_typeof(p_config -> v_text) <> 'array'
         or jsonb_array_length(p_config -> v_text) = 0
         or jsonb_array_length(p_config -> v_text) > 50 then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
      v_seen := '{}'::text[];
      for v_value in select value from jsonb_array_elements(p_config -> v_text) loop
        if jsonb_typeof(v_value) <> 'number' then
          raise exception 'VALIDATION' using errcode = '22023';
        end if;
        v_number := (v_value #>> '{}')::numeric;
        if v_number <= 0 or trunc(v_number) <> v_number or v_number > 100000
           or v_number::text = any(v_seen) then
          raise exception 'VALIDATION' using errcode = '22023';
        end if;
        v_seen := array_append(v_seen, v_number::text);
      end loop;
    end if;
  end loop;

  if p_config ? 'weighting' then
    if jsonb_typeof(p_config -> 'weighting') <> 'object' then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    if (p_config -> 'weighting') ? 'jury' then
      begin
        v_number := (p_config -> 'weighting' ->> 'jury')::numeric;
      exception when others then
        raise exception 'VALIDATION' using errcode = '22023';
      end;
      if v_number < 0 or v_number > 100 then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
    end if;
    if (p_config -> 'weighting') ? 'televote' then
      begin
        v_number := (p_config -> 'weighting' ->> 'televote')::numeric;
      exception when others then
        raise exception 'VALIDATION' using errcode = '22023';
      end;
      if v_number < 0 or v_number > 100 then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
    end if;
    if (p_config -> 'weighting') ? 'jury'
       and (p_config -> 'weighting') ? 'televote'
       and abs((p_config -> 'weighting' ->> 'jury')::numeric
             + (p_config -> 'weighting' ->> 'televote')::numeric - 100) > 0.0001 then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
  end if;

  if p_config ? 'tieBreak' then
    if jsonb_typeof(p_config -> 'tieBreak') <> 'array'
       or jsonb_array_length(p_config -> 'tieBreak') = 0
       or jsonb_array_length(p_config -> 'tieBreak') > 5 then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_seen := '{}'::text[];
    for v_value in select value from jsonb_array_elements(p_config -> 'tieBreak') loop
      if jsonb_typeof(v_value) <> 'string' then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
      v_text := v_value #>> '{}';
      if v_text not in ('televote','jury','twelves','countback','runningOrder')
         or v_text = any(v_seen) then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
      v_seen := array_append(v_seen, v_text);
    end loop;
  end if;

  if p_config ? 'qualifiers' and jsonb_typeof(p_config -> 'qualifiers') <> 'null' then
    if jsonb_typeof(p_config -> 'qualifiers') <> 'number' then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_number := (p_config ->> 'qualifiers')::numeric;
    if v_number < 0 or trunc(v_number) <> v_number or v_number > 1000 then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
  end if;

  if p_config ? 'votingOrder' then
    if jsonb_typeof(p_config -> 'votingOrder') <> 'array'
       or jsonb_array_length(p_config -> 'votingOrder') > 500 then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    for v_value in select value from jsonb_array_elements(p_config -> 'votingOrder') loop
      if jsonb_typeof(v_value) <> 'string' or length(v_value #>> '{}') > 160 then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
    end loop;
  end if;
end
$validate$;

create or replace function private.v3_assert_voting_config_televote_round_shape(p_config jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $rounds$
declare
  v_round jsonb;
  v_weight numeric;
  v_weight_sum numeric := 0;
  v_ids text[] := '{}'::text[];
  v_id text;
begin
  if not (p_config ? 'televoteRounds') then return; end if;
  if jsonb_typeof(p_config -> 'televoteRounds') <> 'array'
     or jsonb_array_length(p_config -> 'televoteRounds') < 1
     or jsonb_array_length(p_config -> 'televoteRounds') > 2 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  for v_round in select value from jsonb_array_elements(p_config -> 'televoteRounds') loop
    if jsonb_typeof(v_round) <> 'object'
       or not (v_round ? 'weight')
       or jsonb_typeof(v_round -> 'weight') <> 'number' then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_weight := (v_round ->> 'weight')::numeric;
    if v_weight < 0 or v_weight > 100 then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_weight_sum := v_weight_sum + v_weight;

    if v_round ? 'id' then
      if jsonb_typeof(v_round -> 'id') <> 'string' then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
      v_id := btrim(v_round ->> 'id');
      if v_id = '' or char_length(v_id) > 80 or v_id = any(v_ids) then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
      v_ids := array_append(v_ids, v_id);
    end if;
    if v_round ? 'label'
       and (jsonb_typeof(v_round -> 'label') <> 'string'
            or char_length(btrim(v_round ->> 'label')) > 120) then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
  end loop;

  if abs(v_weight_sum - 100) > 0.0001 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
end
$rounds$;

create or replace function private.v3_voting_config_evidence(p_edition_id uuid, p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $evidence$
  select jsonb_build_object(
    'juryWindowStatus', coalesce((
      select window.status from public.jury_voting_windows window
      where window.edition_id = p_edition_id and window.show_id = p_show_id
    ), 'not_started'),
    'juryScoreRows', (select count(*) from public.jury_votes v where v.edition_id = p_edition_id and v.show_id = p_show_id),
    'juryBallotSubmissions', (select count(*) from public.jury_ballot_submissions b where b.edition_id = p_edition_id and b.show_id = p_show_id),
    'juryBallotStatuses', (select count(*) from public.jury_ballot_statuses s where s.edition_id = p_edition_id and s.show_id = p_show_id),
    'televoteRows', (select count(*) from public.televote_votes v where v.edition_id = p_edition_id and v.show_id = p_show_id),
    'televoteContributionRows', (select count(*) from public.public_televote_country_contributions c where c.show_id = p_show_id),
    'televoteFrozenBindings', (select count(*) from public.televoting_round_bindings b where b.edition_id = p_edition_id and b.show_id = p_show_id and b.frozen_at is not null),
    'resultCalculationVersion', coalesce((select o.calculation_version from public.studio2_result_operations o where o.edition_id = p_edition_id and o.show_id = p_show_id), 0),
    'resultReviewedVersion', (select o.reviewed_version from public.studio2_result_operations o where o.edition_id = p_edition_id and o.show_id = p_show_id),
    'resultLockedVersion', (select o.locked_version from public.studio2_result_operations o where o.edition_id = p_edition_id and o.show_id = p_show_id),
    'resultRevealReadyVersion', (select o.reveal_ready_version from public.studio2_result_operations o where o.edition_id = p_edition_id and o.show_id = p_show_id),
    'resultPublicationProtected', exists (
      select 1 from public.studio2_show_publication_controls control
      where control.edition_id = p_edition_id and control.show_id = p_show_id
        and control.state in ('scheduled','public')
        and private.studio2_publication_has_outcomes(control.frozen_config)
    ) or exists (
      select 1 from public.shows s
      where s.id = p_show_id and s.edition_id = p_edition_id and coalesce(s.published,false)
        and (
          case
            when s.publication_config is null or jsonb_typeof(s.publication_config) <> 'object'
              or not (s.publication_config ? 'participants' or s.publication_config ? 'artists'
                      or s.publication_config ? 'songs' or s.publication_config ? 'semi_split'
                      or s.publication_config ? 'running_order' or s.publication_config ? 'qualifiers'
                      or s.publication_config ? 'results' or s.publication_config ? 'jury_results'
                      or s.publication_config ? 'televote_results' or s.publication_config ? 'detailed_voting')
            then true
            else s.publication_config -> 'qualifiers' = 'true'::jsonb
              or s.publication_config -> 'results' = 'true'::jsonb
              or s.publication_config -> 'jury_results' = 'true'::jsonb
              or s.publication_config -> 'televote_results' = 'true'::jsonb
              or s.publication_config -> 'detailed_voting' = 'true'::jsonb
          end
        )
    )
  )
$evidence$;

create or replace function private.v3_voting_config_change_blocked(p_evidence jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $blocked$
  select
    coalesce(p_evidence ->> 'juryWindowStatus', 'not_started') not in ('not_started','upcoming','locked')
    or coalesce((p_evidence ->> 'juryScoreRows')::bigint,0) > 0
    or coalesce((p_evidence ->> 'juryBallotSubmissions')::bigint,0) > 0
    or coalesce((p_evidence ->> 'juryBallotStatuses')::bigint,0) > 0
    or coalesce((p_evidence ->> 'televoteRows')::bigint,0) > 0
    or coalesce((p_evidence ->> 'televoteContributionRows')::bigint,0) > 0
    or coalesce((p_evidence ->> 'televoteFrozenBindings')::bigint,0) > 0
    or coalesce((p_evidence ->> 'resultCalculationVersion')::bigint,0) > 0
    or (p_evidence ->> 'resultReviewedVersion') is not null
    or (p_evidence ->> 'resultLockedVersion') is not null
    or (p_evidence ->> 'resultRevealReadyVersion') is not null
    or coalesce((p_evidence ->> 'resultPublicationProtected')::boolean,false)
$blocked$;

create or replace function private.v3_assert_voting_config_change_allowed(p_edition_id uuid, p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
declare v_evidence jsonb;
begin
  v_evidence := private.v3_voting_config_evidence(p_edition_id,p_show_id);
  if private.v3_voting_config_change_blocked(v_evidence) then
    raise sqlstate 'PT409' using
      message = 'DEPENDENCY_FAILURE',
      detail = v_evidence::text,
      hint = 'Voting configuration is frozen after official voting or outcome evidence exists.';
  end if;
  return v_evidence;
end
$allowed$;

-- Version 1 means "current config observed at this migration", not a claim
-- about which config any historical calculation used.
insert into private.v3_voting_config_versions(show_id,edition_id,version,updated_at)
select s.id,s.edition_id,1,now() from public.shows s
on conflict (show_id) do nothing;

insert into private.v3_voting_config_history(show_id,edition_id,version,config,changed_at,changed_by,operation_id,reason)
select s.id,s.edition_id,1,coalesce(s.voting_config,'{}'::jsonb),now(),null,null,'V3 current-state baseline observed at migration'
from public.shows s
on conflict (show_id,version) do nothing;

create or replace function private.v3_guard_voting_config_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  perform private.v3_assert_voting_config_shape(coalesce(new.voting_config,'{}'::jsonb));
  perform private.v3_assert_voting_config_televote_round_shape(coalesce(new.voting_config,'{}'::jsonb));

  if coalesce(new.voting_config,'{}'::jsonb) ? 'qualifiers' then
    if jsonb_typeof(new.voting_config -> 'qualifiers') = 'number' then
      new.qualifier_count := (new.voting_config ->> 'qualifiers')::integer;
    elsif jsonb_typeof(new.voting_config -> 'qualifiers') = 'null' then
      new.qualifier_count := null;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.voting_config is distinct from new.voting_config then
    perform private.v3_assert_voting_config_change_allowed(new.edition_id,new.id);
  end if;
  return new;
end
$guard$;

create or replace function private.v3_record_voting_config_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $record$
declare
  v_version bigint;
  v_operation_id uuid;
  v_reason text := nullif(current_setting('v3.voting_config_reason',true),'');
begin
  if tg_op = 'UPDATE' and old.voting_config is not distinct from new.voting_config then return new; end if;
  begin
    v_operation_id := nullif(current_setting('v3.voting_config_operation_id',true),'')::uuid;
  exception when invalid_text_representation then
    v_operation_id := null;
  end;

  if tg_op = 'INSERT' then
    insert into private.v3_voting_config_versions(show_id,edition_id,version,updated_at)
    values(new.id,new.edition_id,1,now()) on conflict(show_id) do nothing;
    v_version := 1;
  else
    insert into private.v3_voting_config_versions(show_id,edition_id,version,updated_at)
    values(new.id,new.edition_id,2,now())
    on conflict(show_id) do update set
      edition_id=excluded.edition_id,
      version=private.v3_voting_config_versions.version+1,
      updated_at=now()
    returning version into v_version;
  end if;

  insert into private.v3_voting_config_history(show_id,edition_id,version,config,changed_at,changed_by,operation_id,reason)
  values(new.id,new.edition_id,v_version,coalesce(new.voting_config,'{}'::jsonb),now(),auth.uid(),v_operation_id,v_reason)
  on conflict(show_id,version) do nothing;
  return new;
end
$record$;

revoke all on function private.v3_assert_voting_config_shape(jsonb) from public,anon,authenticated;
revoke all on function private.v3_assert_voting_config_televote_round_shape(jsonb) from public,anon,authenticated;
revoke all on function private.v3_voting_config_evidence(uuid,uuid) from public,anon,authenticated;
revoke all on function private.v3_voting_config_change_blocked(jsonb) from public,anon,authenticated;
revoke all on function private.v3_assert_voting_config_change_allowed(uuid,uuid) from public,anon,authenticated;
revoke all on function private.v3_guard_voting_config_write() from public,anon,authenticated;
revoke all on function private.v3_record_voting_config_version() from public,anon,authenticated;

drop trigger if exists v3_guard_voting_config_write on public.shows;
create trigger v3_guard_voting_config_write before insert or update of voting_config on public.shows
for each row execute function private.v3_guard_voting_config_write();

drop trigger if exists v3_record_voting_config_version on public.shows;
create trigger v3_record_voting_config_version after insert or update of voting_config on public.shows
for each row execute function private.v3_record_voting_config_version();

-- Only future/new calculations are allowed to claim exact config provenance.
-- Existing calculated rows remain NULL because this migration cannot know which
-- historical config generated them.
alter table public.studio2_result_operations
  add column if not exists voting_config_version bigint;

create or replace function private.v3_bind_result_operation_voting_config_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bind$
begin
  if new.calculation_version > 0
     and (tg_op='INSERT' or old.calculation_version is distinct from new.calculation_version) then
    select v.version into new.voting_config_version
    from private.v3_voting_config_versions v
    where v.show_id=new.show_id and v.edition_id=new.edition_id;
    if new.voting_config_version is null then
      raise exception 'Result calculation cannot bind a VotingConfig version' using errcode='23514';
    end if;
  end if;
  return new;
end
$bind$;

revoke all on function private.v3_bind_result_operation_voting_config_version() from public,anon,authenticated;
drop trigger if exists v3_bind_result_operation_voting_config_version on public.studio2_result_operations;
create trigger v3_bind_result_operation_voting_config_version
before insert or update of calculation_version on public.studio2_result_operations
for each row execute function private.v3_bind_result_operation_voting_config_version();

create or replace function public.studio2_voting_config_snapshot(p_edition_id uuid,p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $snapshot$
declare
  v_show public.shows;
  v_config jsonb;
  v_version bigint;
  v_evidence jsonb;
  v_jury_weight numeric;
  v_televote_weight numeric;
  v_points text;
  v_tie text;
begin
  if p_edition_id is null or p_show_id is null then raise exception 'VALIDATION' using errcode='22023'; end if;
  if not public.studio2_access_allowed('voting.manage',p_edition_id,false) then
    raise exception 'AUTHORIZATION' using errcode='42501';
  end if;
  select s.* into v_show from public.shows s where s.id=p_show_id and s.edition_id=p_edition_id;
  if v_show.id is null then raise exception 'UNKNOWN' using errcode='P0002'; end if;

  v_config := coalesce(v_show.voting_config,'{}'::jsonb);
  perform private.v3_assert_voting_config_shape(v_config);
  perform private.v3_assert_voting_config_televote_round_shape(v_config);
  select v.version into v_version from private.v3_voting_config_versions v where v.show_id=p_show_id and v.edition_id=p_edition_id;
  if v_version is null then raise exception 'STATE_CHANGED' using errcode='P0001'; end if;
  v_evidence := private.v3_voting_config_evidence(p_edition_id,p_show_id);

  v_jury_weight := coalesce((v_config -> 'weighting' ->> 'jury')::numeric,50);
  v_televote_weight := coalesce((v_config -> 'weighting' ->> 'televote')::numeric,50);
  select coalesce(string_agg(value,', ' order by ordinality),'12, 10, 8, 7, 6, 5, 4, 3, 2, 1') into v_points
  from jsonb_array_elements_text(coalesce(v_config -> 'juryPoints','[12,10,8,7,6,5,4,3,2,1]'::jsonb)) with ordinality as point(value,ordinality);
  select coalesce(string_agg(value,' → ' order by ordinality),'televote → twelves → jury') into v_tie
  from jsonb_array_elements_text(coalesce(v_config -> 'tieBreak','["televote","twelves","jury"]'::jsonb)) with ordinality as rule(value,ordinality);

  return jsonb_build_object(
    'editionId',p_edition_id,'showId',p_show_id,'showName',v_show.name,
    'version',v_version,'config',v_config,
    'summary',jsonb_build_object(
      'jury','Jury '||trim(to_char(v_jury_weight,'FM999990D99'))||'%',
      'public','Public '||trim(to_char(v_televote_weight,'FM999990D99'))||'%',
      'points','Points '||v_points,'tieBreak','Tie: '||v_tie,
      'ownCountry',case when coalesce((v_config ->> 'allowSelfVote')::boolean,false)
        then 'Own-country voting allowed' else 'Own-country voting prohibited' end
    ),
    'evidence',v_evidence,
    'changeBlocked',private.v3_voting_config_change_blocked(v_evidence),
    'resultConfigVersion',(select o.voting_config_version from public.studio2_result_operations o where o.edition_id=p_edition_id and o.show_id=p_show_id),
    'serverTime',now()
  );
end
$snapshot$;

create or replace function public.studio2_voting_config_preflight(p_edition_id uuid,p_show_id uuid,p_proposed_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_evidence jsonb;
  v_changed boolean;
  v_blocked boolean;
begin
  perform private.v3_assert_voting_config_shape(p_proposed_config);
  perform private.v3_assert_voting_config_televote_round_shape(p_proposed_config);
  v_snapshot := public.studio2_voting_config_snapshot(p_edition_id,p_show_id);
  v_evidence := v_snapshot -> 'evidence';
  v_changed := (v_snapshot -> 'config') is distinct from p_proposed_config;
  v_blocked := v_changed and private.v3_voting_config_change_blocked(v_evidence);
  return jsonb_build_object(
    'editionId',p_edition_id,'showId',p_show_id,'expectedVersion',v_snapshot -> 'version',
    'changed',v_changed,'blocked',v_blocked,
    'riskClass',case when not v_changed then 'R1' when v_blocked then 'blocked' else 'R2' end,
    'reasonRequired',false,
    'recalculationRequired',coalesce((v_evidence ->> 'resultCalculationVersion')::bigint,0)>0,
    'evidence',v_evidence,'serverTime',now()
  );
end
$preflight$;

create or replace function public.studio2_apply_voting_config_change(
  p_edition_id uuid,
  p_show_id uuid,
  p_proposed_config jsonb,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
  v_claim jsonb;
  v_show public.shows;
  v_version bigint;
  v_evidence jsonb;
  v_changed boolean;
  v_result jsonb;
  v_event_id uuid;
begin
  if p_edition_id is null or p_show_id is null or p_operation_id is null
     or p_expected_version is null or p_expected_version < 1
     or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
     or p_proposed_config is null then
    raise exception 'VALIDATION' using errcode='22023';
  end if;
  if v_reason is not null and char_length(v_reason)>1000 then raise exception 'VALIDATION' using errcode='22023'; end if;

  -- Replay is resolved before mutable permission/evidence/version checks.
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,p_operation_id,
    'voting.configure','R2',
    jsonb_build_object('editionId',p_edition_id,'showId',p_show_id),
    jsonb_build_object('config',p_proposed_config,'reason',v_reason,'expectedVersion',p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean,false) then
    if v_claim ->> 'status'='succeeded' then
      return coalesce(v_claim -> 'result','{}'::jsonb)||jsonb_build_object('replayed',true);
    end if;
    return public.studio2_reconcile_operation((v_claim ->> 'operationId')::uuid);
  end if;

  if not public.studio2_access_allowed('voting.manage',p_edition_id,false) then
    raise exception 'AUTHORIZATION' using errcode='42501';
  end if;
  perform private.v3_assert_voting_config_shape(p_proposed_config);
  perform private.v3_assert_voting_config_televote_round_shape(p_proposed_config);

  select s.* into v_show from public.shows s
  where s.id=p_show_id and s.edition_id=p_edition_id for update;
  if v_show.id is null then raise sqlstate 'PT409' using message='STATE_CHANGED'; end if;

  select v.version into v_version from private.v3_voting_config_versions v
  where v.show_id=p_show_id and v.edition_id=p_edition_id for update;
  if v_version is null or v_version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message='VERSION_CONFLICT';
  end if;

  v_changed := coalesce(v_show.voting_config,'{}'::jsonb) is distinct from p_proposed_config;
  if v_changed then
    v_evidence := private.v3_assert_voting_config_change_allowed(p_edition_id,p_show_id);
    perform set_config('v3.voting_config_operation_id',p_operation_id::text,true);
    perform set_config('v3.voting_config_reason',coalesce(v_reason,''),true);
    update public.shows set voting_config=p_proposed_config,updated_at=now()
    where id=p_show_id and edition_id=p_edition_id;
    select v.version into v_version from private.v3_voting_config_versions v
    where v.show_id=p_show_id and v.edition_id=p_edition_id;
  else
    v_evidence := private.v3_voting_config_evidence(p_edition_id,p_show_id);
  end if;

  insert into public.admin_audit_log(actor_id,action,table_name,record_id,edition_id,before_data,after_data)
  values(auth.uid(),'voting.configure','shows',p_show_id::text,p_edition_id,
    jsonb_build_object('version',p_expected_version,'config',coalesce(v_show.voting_config,'{}'::jsonb),'operationId',p_operation_id,'reason',v_reason),
    jsonb_build_object('version',v_version,'config',p_proposed_config,'changed',v_changed,'operationId',p_operation_id,'reason',v_reason));

  if v_changed then
    v_event_id := private.v3_emit_domain_event(
      'voting.configuration_changed','voting_configuration',p_show_id::text,v_version,
      p_operation_id,p_edition_id,p_show_id,
      jsonb_build_object('showId',p_show_id,'version',v_version,'previousVersion',p_expected_version),
      1,array[]::text[]
    );
  end if;

  v_result := jsonb_build_object(
    'ok',true,'command','voting.configure','operationId',p_operation_id,'receiptId',p_operation_id,
    'editionId',p_edition_id,'showId',p_show_id,'changed',v_changed,'version',v_version,
    'config',p_proposed_config,'evidence',v_evidence,'eventId',v_event_id,'serverTime',now(),'replayed',false
  );
  return private.studio2_complete_operation(p_operation_id,v_result);
end
$apply$;

revoke all on function public.studio2_voting_config_snapshot(uuid,uuid) from public,anon;
grant execute on function public.studio2_voting_config_snapshot(uuid,uuid) to authenticated,service_role;
revoke all on function public.studio2_voting_config_preflight(uuid,uuid,jsonb) from public,anon;
grant execute on function public.studio2_voting_config_preflight(uuid,uuid,jsonb) to authenticated,service_role;
revoke all on function public.studio2_apply_voting_config_change(uuid,uuid,jsonb,text,uuid,text,bigint) from public,anon;
grant execute on function public.studio2_apply_voting_config_change(uuid,uuid,jsonb,text,uuid,text,bigint) to authenticated,service_role;

comment on function public.studio2_apply_voting_config_change(uuid,uuid,jsonb,text,uuid,text,bigint) is
  'V3 authoritative VotingConfig mutation: replay-first S2 receipt, voting.manage, exact-show CAS, official-evidence freeze, immutable version/history and voting.configuration_changed evidence.';

notify pgrst,'reload schema';
commit;
