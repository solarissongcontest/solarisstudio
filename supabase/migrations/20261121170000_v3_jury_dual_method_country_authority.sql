begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Forward-only dual-method cutover; never modify the three reviewed stages.
-- This step is intentionally NOT authorized for production by A/B/C approval.
do $pre$
begin
  if current_user <> 'postgres'
     or not exists (select 1 from private.v3_migration_contracts where migration_key = 'v3.jury.governed-submission-cutover')
     or not exists (select 1 from private.v3_migration_contracts where migration_key = 'v3.jury.canonical-table-authority')
     or not exists (select 1 from private.v3_migration_contracts where migration_key = 'v3.jury.r2-single-writer-retirement')
  then raise exception 'Jury A/B/C recovery stages required before dual-method authority' using errcode='55000';
  end if;
  if encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text)')), 'UTF8')), 'hex')
     <> '0abd0a2edf61f54fed2b1db22fde200b2c965be1c0b3b1b817837daa5c0384aa'
  then raise exception 'V3 submission wrapper drift; refuse dual-method replacement' using errcode='55000';
  end if;
  if to_regprocedure('public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)') is null
    or to_regprocedure('public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer)') is null
  then raise exception 'Legacy Organizer source missing; refuse unqualified cutover' using errcode='55000';
  end if;
  -- Both existing Organizer interfaces are retired by this migration. Refuse
  -- replacement when either original command drifted since production review.
  if encode(sha256(convert_to(pg_get_functiondef(
       to_regprocedure('public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)')), 'UTF8')), 'hex')
       is distinct from '7d4086203bb359201fe93523cf5a62d35fb5c9da22fc9d3f0845bc182d47d136'
    or encode(sha256(convert_to(pg_get_functiondef(
       to_regprocedure('public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer)')), 'UTF8')), 'hex')
       is distinct from '4acfeebd38bd85cc22c8bbbd01dd1023539f7e061e287eddc1aeaffee0f98d3a'
  then raise exception 'Legacy Organizer Jury command definition drift; refuse authority cutover'
       using errcode='55000';
  end if;
end $pre$;

-- Private drafts cannot be mistaken for accepted public votes. Only a complete
-- ten-allocation ballot is published to jury_votes in one transaction.
create table private.v3_jury_manual_states (
  show_id uuid not null references public.shows(id) on delete restrict,
  voter_identity uuid not null,
  edition_id uuid not null references public.editions(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  complete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(show_id, voter_identity)
);
create table private.v3_jury_manual_scores (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete restrict,
  show_id uuid not null references public.shows(id) on delete restrict,
  voter_identity uuid not null,
  voter_id uuid references public.voters(id) on delete restrict,
  voter_country_id uuid references public.countries(id) on delete restrict,
  voter_entity_id uuid references public.contest_entities(id) on delete restrict,
  receiving_country_id uuid references public.countries(id) on delete restrict,
  receiving_entity_id uuid references public.contest_entities(id) on delete restrict,
  recipient_identity uuid not null,
  points integer not null,
  changed_at timestamptz not null default now(),
  unique(show_id, voter_identity, points),
  unique(show_id, voter_identity, recipient_identity),
  foreign key(show_id, voter_identity) references private.v3_jury_manual_states(show_id,voter_identity) on delete restrict
);
create index on private.v3_jury_manual_scores(show_id, voter_identity);
create table private.v3_jury_manual_operations (
  operation_id uuid primary key,
  actor_id uuid not null,
  edition_id uuid not null,
  show_id uuid not null,
  voter_identity uuid not null,
  request jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now()
);
revoke all on private.v3_jury_manual_states, private.v3_jury_manual_scores,
  private.v3_jury_manual_operations from public, anon, authenticated, service_role;

-- Same deterministic lock key for account submission and Organizer mutations.
-- Country identity wins over voter_id; different roster identities cannot
-- create separate official ballots for the same country/show.
create function private.v3_jury_lock_country(p_show_id uuid, p_identity uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,private as $lock$
begin
  if p_show_id is null or p_identity is null then
    raise exception 'Canonical Jury show and voting identity required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('v3-jury-country:' || p_show_id::text || ':' || p_identity::text, 0)
  );
end $lock$;
revoke all on function private.v3_jury_lock_country(uuid,uuid) from public,anon,authenticated,service_role;

create function private.v3_jury_resolve_voter(
  p_show_id uuid, p_voter_id uuid, p_country_id uuid, p_entity_id uuid
) returns uuid language plpgsql stable security definer
set search_path=pg_catalog,public,private as $identity$
declare v_from_voter uuid;v_from_entity uuid;
begin
  if p_voter_id is not null then
    select country_id into v_from_voter from public.voters where id=p_voter_id;
  end if;
  if p_entity_id is not null then
    select country_id into v_from_entity from public.contest_entities where id=p_entity_id;
  end if;
  if (p_country_id is not null and v_from_voter is not null and p_country_id<>v_from_voter)
    or (p_country_id is not null and v_from_entity is not null and p_country_id<>v_from_entity)
    or (v_from_voter is not null and v_from_entity is not null and v_from_voter<>v_from_entity)
  then raise exception 'Conflicting Jury voting-country identity' using errcode='42501';
  end if;
  return coalesce(p_country_id,v_from_voter,v_from_entity,p_entity_id,p_voter_id);
end $identity$;
revoke all on function private.v3_jury_resolve_voter(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

-- Preserve all existing participant preflight, attestation, receipt and
-- idempotency logic; add only the shared identity lock and draft conflict.
create or replace function public.v3_submit_jury_ballot(
  _show_id uuid,
  _entries jsonb,
  _preflight_id uuid,
  _operation_id uuid,
  _request_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $submit$
declare
  v_user_id uuid := auth.uid();
  v_account public.country_accounts%rowtype;
  v_existing private.v3_jury_operations%rowtype;
  v_ballot_id uuid;
  v_receipt_id uuid := gen_random_uuid();
  v_accepted_at timestamptz := now();
  v_request_hash text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _show_id is null or _preflight_id is null or _operation_id is null
     or _entries is null or jsonb_typeof(_entries) <> 'array' then
    raise exception 'Jury submission context is invalid' using errcode = '22023';
  end if;

  select account.* into v_account
  from public.country_accounts account
  where account.user_id = v_user_id
    and coalesce(account.status, 'active') = 'active'
  limit 1;
  if not found then
    raise exception 'An active country account is required' using errcode = '42501';
  end if;

  v_request_hash := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'show_id', _show_id,
        'preflight_id', _preflight_id,
        'entries', _entries
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  -- Kept only for adapter compatibility. Direct callers cannot choose the
  -- authoritative request identity.
  perform _request_hash;

  perform pg_advisory_xact_lock(hashtextextended('v3-jury:' || _operation_id::text, 0));
  -- The operation-id lock handles retries; the country lock serializes both
  -- official methods, regardless of internal user/voter ids.
  perform private.v3_jury_lock_country(_show_id, v_account.country_id);

  if exists (
    select 1 from private.v3_jury_manual_scores draft
    where draft.show_id = _show_id
      and draft.voter_identity = v_account.country_id
  ) then
    raise exception 'Organizer Jury score entry already exists for this country. Contact the Organizer.'
      using errcode = '23505';
  end if;
  if exists (
    select 1 from public.jury_ballot_statuses status
    where status.show_id=_show_id and status.status='did_not_vote'
      and private.v3_jury_resolve_voter(
        status.show_id,status.voter_id,status.voter_country_id,status.voter_entity_id
      )=v_account.country_id
  ) then
    raise exception 'Your country is marked did-not-vote. Contact the Organizer before voting.'
      using errcode='23514';
  end if;

  select operation.* into v_existing
  from private.v3_jury_operations operation
  where operation.operation_id = _operation_id;

  if found then
    if v_existing.user_id <> v_user_id
       or v_existing.show_id <> _show_id
       or v_existing.voter_country_id <> v_account.country_id
       or v_existing.request_hash <> v_request_hash then
      raise exception 'Jury operation id was already used for a different request'
        using errcode = '22023';
    end if;

    return v_existing.result || jsonb_build_object(
      'receipt', jsonb_build_object(
        'authority', 'authoritative_server',
        'operation_id', v_existing.operation_id,
        'receipt_id', v_existing.receipt_id,
        'ballot_submission_id', v_existing.ballot_submission_id,
        'show_id', v_existing.show_id,
        'voter_country_id', v_existing.voter_country_id,
        'request_hash', v_existing.request_hash,
        'state_version', v_existing.state_version,
        'accepted_at', v_existing.accepted_at,
        'server_time', now(),
        'replayed', true
      )
    );
  end if;

  -- Old Organizer rows may identify the voting country by voter_id or
  -- contest_entity_id alone. The legacy delegate checks only the country
  -- column, so close that historical cross-method identity gap here under
  -- the same country lock, after durable idempotent replay has been handled.
  if exists (
    select 1 from public.jury_votes j
    where j.show_id=_show_id and j.ballot_submission_id is null
      and (
        j.voter_country_id=v_account.country_id
        or exists(select 1 from public.voters v
          where v.id=j.voter_id and v.country_id=v_account.country_id)
        or exists(select 1 from public.contest_entities ce
          where ce.id=j.voter_entity_id and ce.country_id=v_account.country_id)
      )
  ) then
    raise exception 'Organizer Jury scores already exist for this country; cannot submit a second ballot'
      using errcode='23505';
  end if;

  v_ballot_id := public.submit_country_jury_ballot(_show_id, _entries, _preflight_id);
  if v_ballot_id is null then
    raise exception 'Jury submission returned no ballot id' using errcode = '55000';
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'ballot_submission_id', v_ballot_id,
    'show_id', _show_id
  );

  insert into private.v3_jury_operations (
    operation_id, request_hash, show_id, user_id, voter_country_id,
    ballot_submission_id, receipt_id, state_version, result, accepted_at
  ) values (
    _operation_id, v_request_hash, _show_id, v_user_id, v_account.country_id,
    v_ballot_id, v_receipt_id, 1, v_result, v_accepted_at
  );

  delete from private.v3_jury_drafts draft
  where draft.show_id = _show_id and draft.user_id = v_user_id;

  return v_result || jsonb_build_object(
    'receipt', jsonb_build_object(
      'authority', 'authoritative_server',
      'operation_id', _operation_id,
      'receipt_id', v_receipt_id,
      'ballot_submission_id', v_ballot_id,
      'show_id', _show_id,
      'voter_country_id', v_account.country_id,
      'request_hash', v_request_hash,
      'state_version', 1,
      'accepted_at', v_accepted_at,
      'server_time', now(),
      'replayed', false
    )
  );
end
$submit$;

-- Even a privileged internal writer cannot silently mutate immutable
-- account-linked score evidence or mix manual scores with that ballot.
create function private.v3_jury_protect_submitted_vote()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $protect$
begin
  -- OLD does not exist for INSERT, and NEW does not exist for DELETE.
  if tg_op in ('UPDATE','DELETE') then
    if old.ballot_submission_id is not null then
      raise exception 'Accepted account Jury score evidence is immutable'
        using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.ballot_submission_id is null
     and new.voter_country_id is not null and exists (
       select 1 from public.jury_ballot_submissions b
       where b.show_id=new.show_id and b.voter_country_id=new.voter_country_id
     ) then
    raise exception 'Account and manual Jury scores cannot coexist'
      using errcode='23505';
  end if;
  return new;
end $protect$;
revoke all on function private.v3_jury_protect_submitted_vote()
  from public,anon,authenticated,service_role;
create trigger v3_jury_protect_submitted_vote
before insert or update or delete on public.jury_votes
for each row execute function private.v3_jury_protect_submitted_vote();

-- Absence status cannot be finalized while a private manual ballot is
-- underway. The same lock prevents a concurrent account/manual/DNV race.
create function private.v3_jury_protect_manual_dnv()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $dnv$
declare v_identity uuid;
begin
  if new.status='did_not_vote' then
    v_identity:=private.v3_jury_resolve_voter(
      new.show_id,new.voter_id,new.voter_country_id,new.voter_entity_id);
    if v_identity is null then
      raise exception 'DNV requires a voting country or entity' using errcode='22023';end if;
    perform private.v3_jury_lock_country(new.show_id,v_identity);
    if exists(select 1 from private.v3_jury_manual_scores d
      where d.show_id=new.show_id and d.voter_identity=v_identity) then
      raise exception 'Cannot mark did-not-vote while Organizer has recorded Jury scores'
        using errcode='23514';
    end if;
  end if;
  return new;
end $dnv$;
revoke all on function private.v3_jury_protect_manual_dnv()
  from public,anon,authenticated,service_role;
create trigger v3_jury_protect_manual_dnv
before insert or update on public.jury_ballot_statuses
for each row execute function private.v3_jury_protect_manual_dnv();

-- Organizer's one-score-at-a-time actions use a server-issued revision and
-- operation identity. This read-only preview exposes no data to non-Organizers.
create function public.v3_organizer_jury_score_preview(
  p_edition_id uuid,p_show_id uuid,p_voter_id uuid,
  p_voter_country_id uuid,p_voter_entity_id uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $preview$
declare v_identity uuid;v_revision bigint;v_complete boolean;v_country uuid;
        v_legacy_complete boolean:=false;v_scale integer[];
begin
  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,p_show_id,p_voter_id,p_voter_country_id,p_voter_entity_id,null,null,null);
  if p_show_id is null or not public.studio2_access_allowed('jury.ballots.manage',p_edition_id,false) then
    raise exception 'Missing Organizer Jury capability or show' using errcode='42501';
  end if;
  v_identity:=private.v3_jury_resolve_voter(p_show_id,p_voter_id,p_voter_country_id,p_voter_entity_id);
  select v.country_id into v_country from public.voters v where v.id=p_voter_id;
  v_country:=coalesce(p_voter_country_id,v_country,
    (select ce.country_id from public.contest_entities ce where ce.id=p_voter_entity_id));
  select revision,complete into v_revision,v_complete from private.v3_jury_manual_states
    where show_id=p_show_id and voter_identity=v_identity;
  -- Before a legacy manual ballot is first edited, the new private revision
  -- store has no row. The Organizer must still see it as complete and supply
  -- the mandatory correction reason. Otherwise preview and apply disagree.
  if coalesce(v_revision,0)=0 then
    select array_agg(value::integer) into v_scale
    from jsonb_array_elements_text(coalesce(
      (select voting_config->'juryPoints' from public.shows where id=p_show_id),
      '[12,10,8,7,6,5,4,3,2,1]'::jsonb
    )) scale(value);
    select cardinality(v_scale)>0
      and count(*)=cardinality(v_scale)
      and count(distinct j.points)=cardinality(v_scale)
      and coalesce(bool_and(j.points=any(v_scale)),false)
    into v_legacy_complete
    from public.jury_votes j
    where j.show_id=p_show_id and j.edition_id=p_edition_id
      and j.ballot_submission_id is null
      and ((v_country is not null and j.voter_country_id=v_country)
        or (v_country is null and coalesce(j.voter_entity_id,j.voter_id)=v_identity));
  end if;
  return jsonb_build_object(
    'expectedVersion',coalesce(v_revision,0),
    'complete',coalesce(v_complete,false) or coalesce(v_legacy_complete,false),
    'lockedByAccount',v_country is not null and exists(
      select 1 from public.jury_ballot_submissions b
      where b.show_id=p_show_id and b.voter_country_id=v_country),
    'riskClass','R2','showId',p_show_id,'editionId',p_edition_id);
end $preview$;

create function public.v3_organizer_jury_manual_snapshot(p_show_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,private as $snapshot$
declare v_edition uuid;
begin
  select edition_id into v_edition from public.shows where id=p_show_id;
  if v_edition is null or not public.studio2_access_allowed('jury.ballots.manage',v_edition,false) then
    raise exception 'Missing Organizer Jury capability' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) - 'recipient_identity' - 'voter_identity' - 'changed_at')
    from private.v3_jury_manual_scores s
    join private.v3_jury_manual_states st
      on st.show_id=s.show_id and st.voter_identity=s.voter_identity
    where s.show_id=p_show_id and not st.complete
  ),'[]'::jsonb);
end $snapshot$;

create function public.v3_organizer_jury_score_apply(
  p_edition_id uuid,p_show_id uuid,p_voter_id uuid,
  p_voter_country_id uuid,p_voter_entity_id uuid,
  p_receiving_country_id uuid,p_receiving_entity_id uuid,
  p_points integer,p_action text,p_expected_version bigint,
  p_operation_id uuid,p_reason text default null
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,private as $apply$
declare
  v_identity uuid;v_country uuid;v_recipient uuid;v_show public.shows%rowtype;
  v_state private.v3_jury_manual_states%rowtype;v_op private.v3_jury_manual_operations%rowtype;
  v_req jsonb;v_scale integer[];v_count int;v_distinct int;v_capacity int;
  v_complete boolean;v_result jsonb;v_before jsonb;v_after jsonb;
begin
  if p_operation_id is null or p_expected_version is null or p_expected_version<0
     or p_action not in ('assign','clear') or p_points is null then
    raise exception 'Action, operation id, score and expected revision are required' using errcode='22023';
  end if;
  select * into v_show from public.shows where id=p_show_id;
  if not found or v_show.edition_id is distinct from p_edition_id then
    raise exception 'Jury show is not in this edition' using errcode='42501';
  end if;
  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,p_show_id,p_voter_id,p_voter_country_id,p_voter_entity_id,
    case when p_action='assign' then p_receiving_country_id else null end,
    case when p_action='assign' then p_receiving_entity_id else null end,null);
  if not public.studio2_access_allowed('jury.ballots.manage',p_edition_id,true) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode='42501';
  end if;
  v_identity:=private.v3_jury_resolve_voter(p_show_id,p_voter_id,p_voter_country_id,p_voter_entity_id);
  if v_identity is null then raise exception 'Voting country or entity is required' using errcode='22023';end if;
  v_country:=coalesce(p_voter_country_id,
    (select v.country_id from public.voters v where v.id=p_voter_id),
    (select ce.country_id from public.contest_entities ce where ce.id=p_voter_entity_id));
  perform private.v3_jury_lock_country(p_show_id,v_identity);
  if v_country is not null and exists(
    select 1 from public.jury_ballot_submissions b
    where b.show_id=p_show_id and b.voter_country_id=v_country
  ) then
    raise exception 'Account-submitted Jury ballot is immutable. Use governed ballot review; score replacement needs separately approved correction policy.'
      using errcode='23505';
  end if;
  if exists(
    select 1 from public.jury_ballot_statuses st
    where st.show_id=p_show_id and st.status='did_not_vote'
      and private.v3_jury_resolve_voter(
        st.show_id,st.voter_id,st.voter_country_id,st.voter_entity_id
      )=v_identity
  ) then raise exception 'Restore this Jury from did-not-vote before entering scores' using errcode='23514';end if;
  if exists(select 1 from public.voters v where v.show_id=p_show_id) then
    if not exists(
      select 1 from public.voters v
      where v.show_id=p_show_id and (
        (v_country is not null and v.country_id=v_country)
        or (v_country is null and p_voter_entity_id is not null
          and v.contest_entity_id=p_voter_entity_id)
        or (v_country is null and p_voter_id is not null and v.id=p_voter_id))
    ) then
      raise exception 'Voting delegation is absent from the show-specific Jury roster'
        using errcode='42501';
    end if;
  elsif v_country is not null and not exists (
    select 1 from public.participants p
    where p.show_id=p_show_id and p.country_id=v_country
      and (p.participation_status is null or p.participation_status='confirmed')
  ) then
    raise exception 'Voting country is not eligible in this show' using errcode='42501';
  end if;
  if coalesce((v_show.voting_config->>'juryEnabled')::boolean,true)=false then
    raise exception 'Jury scoring is disabled for this show' using errcode='23514';
  end if;
  if jsonb_typeof(coalesce(v_show.voting_config->'juryPoints','[12,10,8,7,6,5,4,3,2,1]'::jsonb))<>'array' then
    raise exception 'Invalid configured Jury score scale' using errcode='23514';
  end if;
  select array_agg(x.value::integer order by x.ordinality),
    count(*)::integer,count(distinct x.value::integer)::integer
  into v_scale,v_count,v_distinct
  from jsonb_array_elements_text(
    coalesce(v_show.voting_config->'juryPoints','[12,10,8,7,6,5,4,3,2,1]'::jsonb)
  ) with ordinality x(value,ordinality);
  if v_count=0 or v_count is distinct from v_distinct or not p_points=any(v_scale) then
    raise exception 'Score is not in the configured unique Jury point scale' using errcode='23514';
  end if;
  select count(*)::integer into v_capacity
  from public.participants p
  where p.show_id=p_show_id
    and (p.participation_status is null or p.participation_status='confirmed')
    and (coalesce((v_show.voting_config->>'allowSelfVote')::boolean,false)
      or v_country is null or p.country_id is distinct from v_country);
  if v_capacity<v_count then
    raise exception 'Not enough eligible recipients for this Jury score scale' using errcode='23514';
  end if;
  if p_action='assign' then
    -- Canonicalize global contest entities to the receiving COUNTRY. A target
    -- chosen once by country ID and again by global entity ID is still one
    -- recipient, and both must enforce the same self-voting rule.
    v_recipient:=coalesce(
      p_receiving_country_id,
      (select ce.country_id from public.contest_entities ce where ce.id=p_receiving_entity_id),
      p_receiving_entity_id
    );
    if v_recipient is null or not exists(
      select 1 from public.participants p where p.show_id=p_show_id
        and (p.participation_status is null or p.participation_status='confirmed')
        and ((p_receiving_country_id is not null and p.country_id=p_receiving_country_id)
           or (p_receiving_country_id is null and p.contest_entity_id=p_receiving_entity_id))
    ) then
      raise exception 'Jury recipient is not eligible in this show' using errcode='23514';
    end if;
    if not coalesce((v_show.voting_config->>'allowSelfVote')::boolean,false)
       and ((v_country is not null and v_country=v_recipient)
         or (v_country is null and p_voter_entity_id is not null
             and p_voter_entity_id=p_receiving_entity_id)) then
      raise exception 'Jury self-voting is prohibited' using errcode='23514';
    end if;
  else
    if p_receiving_country_id is not null or p_receiving_entity_id is not null then
      raise exception 'Clear a score without supplying a recipient' using errcode='22023';
    end if;
  end if;

  v_req:=jsonb_build_object(
    'edition',p_edition_id,'show',p_show_id,'identity',v_identity,'voter',p_voter_id,
    'country',p_voter_country_id,'entity',p_voter_entity_id,
    'receiverCountry',p_receiving_country_id,'receiverEntity',p_receiving_entity_id,
    'points',p_points,'action',p_action,'expectedVersion',p_expected_version,'reason',p_reason);
  select * into v_op from private.v3_jury_manual_operations where operation_id=p_operation_id;
  if found then
    if v_op.actor_id is distinct from auth.uid() or v_op.request is distinct from v_req then
      raise exception 'Jury operation id was already used for different input' using errcode='22023';end if;
    return v_op.result || jsonb_build_object('replayed',true);
  end if;

  insert into private.v3_jury_manual_states(show_id,voter_identity,edition_id)
    values(p_show_id,v_identity,p_edition_id)
    on conflict(show_id,voter_identity) do nothing;
  select * into v_state from private.v3_jury_manual_states
    where show_id=p_show_id and voter_identity=v_identity for update;
  if v_state.revision is distinct from p_expected_version then
    raise exception 'Jury scores changed since the preview. Refresh and retry.'
      using errcode='40001';
  end if;
  -- Editing a completed manual ballot is a governed, reasoned correction,
  -- including a legacy complete ballot encountered for the first time.
  if (v_state.complete or (v_state.revision=0 and
      (select count(*) from public.jury_votes j
       where j.show_id=p_show_id and j.edition_id=p_edition_id
         and j.ballot_submission_id is null
         and ((v_country is not null and j.voter_country_id=v_country)
           or (v_country is null and coalesce(j.voter_entity_id,j.voter_id)=v_identity))
      )=cardinality(v_scale)))
     and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'Correcting a complete Jury ballot requires an explicit reason'
      using errcode='22023';
  end if;
  -- Adopt any preexisting manual allocations once, without changing historical
  -- accepted points until an Organizer actually edits that ballot.
  if v_state.revision=0 then
    insert into private.v3_jury_manual_scores(
      edition_id,show_id,voter_identity,voter_id,voter_country_id,voter_entity_id,
      receiving_country_id,receiving_entity_id,recipient_identity,points)
    select j.edition_id,j.show_id,v_identity,j.voter_id,j.voter_country_id,j.voter_entity_id,
      j.receiving_country_id,j.receiving_entity_id,
      coalesce(j.receiving_country_id,j.receiving_entity_id),j.points
    from public.jury_votes j
    where j.show_id=p_show_id and j.edition_id=p_edition_id
      and j.ballot_submission_id is null
      and ((v_country is not null and j.voter_country_id=v_country)
        or (v_country is null and coalesce(j.voter_entity_id,j.voter_id)=v_identity))
    on conflict do nothing;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('point',d.points,'recipient',d.recipient_identity)),'[]'::jsonb)
  into v_before from private.v3_jury_manual_scores d
  where d.show_id=p_show_id and d.voter_identity=v_identity;

  delete from private.v3_jury_manual_scores d
  where d.show_id=p_show_id and d.voter_identity=v_identity
    and (d.points=p_points or
       (p_action='assign' and d.recipient_identity=v_recipient));
  if p_action='assign' then
    insert into private.v3_jury_manual_scores(
      edition_id,show_id,voter_identity,voter_id,voter_country_id,voter_entity_id,
      receiving_country_id,receiving_entity_id,recipient_identity,points)
    values(p_edition_id,p_show_id,v_identity,p_voter_id,v_country,p_voter_entity_id,
      p_receiving_country_id,p_receiving_entity_id,v_recipient,p_points);
  end if;

  select count(*)::integer,
     count(distinct d.points)::integer
  into v_count,v_distinct
  from private.v3_jury_manual_scores d
  where d.show_id=p_show_id and d.voter_identity=v_identity;
  v_complete:=v_count=cardinality(v_scale) and v_count=v_distinct
    and not exists(
      select 1 from private.v3_jury_manual_scores d
      where d.show_id=p_show_id and d.voter_identity=v_identity
        and not d.points=any(v_scale));
  -- During a correction, retain the LAST officially complete manual ballot
  -- until the revised scale is complete. Private drafts never change results.
  -- On completion replace every allocation atomically; triggers recalculate
  -- against the final committed ballot, never a partly corrected draft.
  if v_complete then
    delete from public.jury_votes j
    where j.show_id=p_show_id and j.edition_id=p_edition_id
      and j.ballot_submission_id is null
      and ((v_country is not null and j.voter_country_id=v_country)
        or (v_country is null and coalesce(j.voter_entity_id,j.voter_id)=v_identity));
    insert into public.jury_votes(
      edition_id,show_id,voter_id,voter_country_id,voter_entity_id,
      receiving_country_id,receiving_entity_id,points)
    select d.edition_id,d.show_id,d.voter_id,d.voter_country_id,d.voter_entity_id,
      d.receiving_country_id,d.receiving_entity_id,d.points
    from private.v3_jury_manual_scores d
    where d.show_id=p_show_id and d.voter_identity=v_identity;
  end if;
  update private.v3_jury_manual_states
  set revision=revision+1,complete=v_complete,updated_at=now()
  where show_id=p_show_id and voter_identity=v_identity;
  select coalesce(jsonb_agg(jsonb_build_object('point',d.points,'recipient',d.recipient_identity)),'[]'::jsonb)
  into v_after from private.v3_jury_manual_scores d
  where d.show_id=p_show_id and d.voter_identity=v_identity;

  insert into public.admin_audit_log(
    actor_id,action,table_name,record_id,edition_id,country_id,before_data,after_data)
  values(auth.uid(),'jury_manual_score_'||p_action,'jury_votes',
    v_identity::text,p_edition_id,v_country,v_before,
    jsonb_build_object('scores',v_after,'version',v_state.revision+1,
      'complete',v_complete,'showId',p_show_id,'editionId',p_edition_id,
      'operationId',p_operation_id,'reason',nullif(btrim(coalesce(p_reason,'')),'')));
  v_result:=jsonb_build_object('ok',true,'showId',p_show_id,
    'voterIdentity',v_identity,'version',v_state.revision+1,
    'complete',v_complete,'scoreCount',v_count,'requiredScoreCount',cardinality(v_scale),
    'operationId',p_operation_id,'replayed',false);
  insert into private.v3_jury_manual_operations(
    operation_id,actor_id,edition_id,show_id,voter_identity,request,result)
    values(p_operation_id,auth.uid(),p_edition_id,p_show_id,v_identity,v_req,v_result);
  return v_result;
end $apply$;

revoke all on function public.v3_organizer_jury_score_preview(uuid,uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.v3_organizer_jury_manual_snapshot(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.v3_organizer_jury_score_apply(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text,bigint,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.v3_organizer_jury_score_preview(uuid,uuid,uuid,uuid,uuid)
  to authenticated,service_role;
grant execute on function public.v3_organizer_jury_manual_snapshot(uuid)
  to authenticated,service_role;
grant execute on function public.v3_organizer_jury_score_apply(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text,bigint,uuid,text)
  to authenticated,service_role;

-- Revision and private-state authority must not leak through API-role table
-- grants; the three callables remain capability guarded.
do $post_authority$
declare actor text;
begin
  foreach actor in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(actor,'private.v3_jury_manual_scores','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege(actor,'private.v3_jury_manual_states','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege(actor,'private.v3_jury_manual_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    then raise exception 'Direct manual Jury draft authority is exposed to %',actor using errcode='42501';end if;
  end loop;
end $post_authority$;

-- Retire the mutable legacy entry points, but keep their owner-only definitions
-- for audited historical provenance. Organizer UI uses the CAS command above.
revoke all on function public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;

select public.v3_register_migration_contract(
  'v3.jury.dual-method-country-lock',1,'forward_fix_only',false,null,
  'Serialize account and Organizer jury voting per show/country; preserve partial manual drafts, accepted receipts and governed revisions');
notify pgrst,'reload schema';
commit;
