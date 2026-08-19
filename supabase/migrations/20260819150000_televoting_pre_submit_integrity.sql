begin;

-- A preflight check is a short-lived, server-created snapshot of the exact
-- ballot that was analysed before submission. It never contains raw IPs; only
-- the same irreversible hashes already used by Televoting.
create table if not exists televoting.vote_preflight_checks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references televoting.rounds(id) on delete cascade,
  username_normalized text not null,
  country_code text not null,
  ballot_map jsonb not null default '{}'::jsonb,
  ip_hash text,
  fingerprint_hash text,
  device_token_hash text,
  ip_country text,
  is_vpn boolean not null default false,
  hod_person_id uuid,
  relationship_risk integer not null default 0 check (relationship_risk between 0 and 100),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  severity text not null default 'none' check (severity in ('none','notable','review','strong','high','critical')),
  requires_attestation boolean not null default false,
  findings jsonb not null default '[]'::jsonb,
  technical_signals jsonb not null default '[]'::jsonb,
  history_summary jsonb not null default '{}'::jsonb,
  statement_version integer not null default 1,
  attested_at timestamptz,
  signed_name text,
  attestation_text text,
  attestation_ip_hash text,
  submission_id uuid references televoting.vote_submissions(id) on delete set null,
  submitted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists televoting_vote_preflight_round_idx
  on televoting.vote_preflight_checks(round_id, created_at desc);
create index if not exists televoting_vote_preflight_country_idx
  on televoting.vote_preflight_checks(country_code, created_at desc);
create index if not exists televoting_vote_preflight_attestation_idx
  on televoting.vote_preflight_checks(requires_attestation, attested_at, created_at desc);

alter table televoting.vote_preflight_checks enable row level security;
revoke all on table televoting.vote_preflight_checks from anon, authenticated;

-- The old submission RPC treated a real-world IP geolocation that did not
-- match a fictional Solaris country as suspicious. That premise is invalid.
-- Final submission now requires a server-created preflight token instead.
create or replace function televoting.submit_vote_checked(
  p_round_id uuid,
  p_username text,
  p_country_code text,
  p_entries jsonb,
  p_preflight_token uuid,
  p_ip_hash text default null,
  p_fingerprint_hash text default null,
  p_device_token_hash text default null,
  p_ip_country text default null,
  p_is_vpn boolean default false
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_round televoting.rounds%rowtype;
  v_preflight televoting.vote_preflight_checks%rowtype;
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
  v_self_key text;
  v_ballot_map jsonb := '{}'::jsonb;
begin
  if p_username is null or length(trim(p_username))<2 then
    raise exception 'Username required' using errcode='22023';
  end if;
  if p_preflight_token is null then
    raise exception 'Review this ballot with the automatic voting integrity check before submitting' using errcode='22023';
  end if;

  v_username_norm := lower(trim(p_username));
  select * into v_round from televoting.rounds where id=p_round_id;
  if not found then raise exception 'Round not found' using errcode='22023'; end if;
  if v_round.status<>'open' then raise exception 'Round is not open' using errcode='22023'; end if;

  select array_agg(entry_key) into v_round_keys
  from televoting.round_entries where round_id=p_round_id;
  if v_round_keys is null or array_length(v_round_keys,1)<2 then
    raise exception 'Round has no entries configured' using errcode='22023';
  end if;

  select exists(select 1 from televoting.countries where code=p_country_code) into v_home_exists;
  if not v_home_exists then raise exception 'Unknown home country' using errcode='22023'; end if;
  if p_entries is null or jsonb_typeof(p_entries)<>'array' then
    raise exception 'Invalid entries payload' using errcode='22023';
  end if;

  if coalesce(v_round.self_voting_mode,'country_match') in ('country_match','linked_identity','disabled') then
    select entry_key into v_self_key
    from televoting.round_entries
    where round_id=p_round_id and entry_type='country' and country_code=p_country_code;
  end if;
  if coalesce(v_round.self_voting_mode,'country_match')='unrestricted' then v_self_key:=null; end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_tc:=v_entry->>'target_country_code';
    v_pts:=(v_entry->>'points')::int;
    if v_pts is null or v_pts<1 or v_pts>10 then
      raise exception 'Points must be 1-10' using errcode='22023';
    end if;
    if v_self_key is not null and v_tc=v_self_key then
      insert into televoting.anti_abuse_events(
        round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
        device_token_hash,reason,risk_score,metadata
      ) values(
        p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
        p_device_token_hash,'self_vote',80,
        jsonb_build_object('ip_country',p_ip_country,'is_vpn',p_is_vpn)
      );
      raise exception 'Cannot vote for your own entry' using errcode='22023';
    end if;
    if not (v_tc=any(v_round_keys)) then
      raise exception 'Entry is not part of this round' using errcode='22023';
    end if;
    if v_tc=any(v_seen) then
      raise exception 'Duplicate entry in ballot' using errcode='22023';
    end if;
    v_seen:=v_seen||v_tc;
    v_total:=v_total+v_pts;
    v_ballot_map:=v_ballot_map || jsonb_build_object(v_tc,v_pts);
  end loop;

  v_count:=coalesce(array_length(v_seen,1),0);
  if v_total<>20 then
    insert into televoting.anti_abuse_events(
      round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
      device_token_hash,reason,risk_score,metadata
    ) values(
      p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
      p_device_token_hash,'wrong_total_points',60,jsonb_build_object('total',v_total)
    );
    raise exception 'Total must be exactly 20 points (got %)',v_total using errcode='22023';
  end if;
  if v_count<5 then
    insert into televoting.anti_abuse_events(
      round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
      device_token_hash,reason,risk_score,metadata
    ) values(
      p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
      p_device_token_hash,'too_few_countries',50,jsonb_build_object('count',v_count)
    );
    raise exception 'Vote at least 5 different entries' using errcode='22023';
  end if;

  select * into v_preflight
  from televoting.vote_preflight_checks
  where id=p_preflight_token
  for update;

  if not found then
    raise exception 'Voting integrity check not found. Review the ballot again.' using errcode='22023';
  end if;
  if v_preflight.expires_at<=now() then
    raise exception 'Voting integrity check expired. Review the ballot again.' using errcode='22023';
  end if;
  if v_preflight.submitted_at is not null then
    raise exception 'This voting integrity check has already been used' using errcode='23505';
  end if;
  if v_preflight.round_id<>p_round_id
     or v_preflight.username_normalized<>v_username_norm
     or upper(v_preflight.country_code)<>upper(p_country_code) then
    raise exception 'Ballot identity changed after the integrity check. Review it again.' using errcode='22023';
  end if;
  if v_preflight.ballot_map<>v_ballot_map then
    raise exception 'Ballot changed after the integrity check. Review the updated ballot again.' using errcode='22023';
  end if;
  if coalesce(v_preflight.ip_hash,'')<>coalesce(p_ip_hash,'')
     or coalesce(v_preflight.fingerprint_hash,'')<>coalesce(p_fingerprint_hash,'')
     or coalesce(v_preflight.device_token_hash,'')<>coalesce(p_device_token_hash,'') then
    raise exception 'Connection or device identity changed after the integrity check. Review the ballot again.' using errcode='22023';
  end if;
  if v_preflight.requires_attestation and v_preflight.attested_at is null then
    raise exception 'This ballot requires the voting-integrity declaration before it can be submitted' using errcode='22023';
  end if;

  if exists(select 1 from televoting.vote_submissions where round_id=p_round_id and username_normalized=v_username_norm and status<>'deleted') then
    raise exception 'You have already voted in this round' using errcode='23505';
  end if;
  if p_ip_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and ip_hash=p_ip_hash and status<>'deleted') then
    raise exception 'A vote from this network was already recorded' using errcode='23505';
  end if;
  if p_fingerprint_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and fingerprint_hash=p_fingerprint_hash and status<>'deleted') then
    raise exception 'A vote from this device was already recorded' using errcode='23505';
  end if;
  if p_device_token_hash is not null and exists(select 1 from televoting.vote_submissions where round_id=p_round_id and device_token_hash=p_device_token_hash and status<>'deleted') then
    raise exception 'A vote from this device was already recorded' using errcode='23505';
  end if;

  -- Real-world IP geography and VPN/proxy metadata are stored only as technical
  -- context. They do not create risk merely because they differ from the
  -- fictional voting country. Historical IP *changes* are assessed in preflight.
  insert into televoting.vote_submissions(
    round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
    device_token_hash,ip_country,is_vpn,risk_score,status
  ) values(
    p_round_id,trim(p_username),v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
    p_device_token_hash,p_ip_country,coalesce(p_is_vpn,false),v_preflight.risk_score,
    case when v_preflight.requires_attestation then 'suspicious' else 'active' end
  ) returning id into v_sub_id;

  insert into televoting.vote_entries(submission_id,target_country_code,points)
  select v_sub_id,e->>'target_country_code',(e->>'points')::int
  from jsonb_array_elements(p_entries)e;

  if v_preflight.requires_attestation or v_preflight.risk_score>0 then
    insert into televoting.anti_abuse_events(
      round_id,username,username_normalized,country_code,ip_hash,fingerprint_hash,
      device_token_hash,reason,risk_score,metadata,status
    ) values(
      p_round_id,p_username,v_username_norm,p_country_code,p_ip_hash,p_fingerprint_hash,
      p_device_token_hash,'pre_submit_integrity_check',v_preflight.risk_score,
      jsonb_build_object(
        'preflight_id',v_preflight.id,
        'severity',v_preflight.severity,
        'relationship_risk',v_preflight.relationship_risk,
        'findings',v_preflight.findings,
        'technical_signals',v_preflight.technical_signals,
        'attested',v_preflight.attested_at is not null,
        'ip_country',p_ip_country,
        'is_vpn',p_is_vpn
      ),
      case when v_preflight.requires_attestation then 'pending' else 'context' end
    );
  end if;

  update televoting.vote_preflight_checks
  set submission_id=v_sub_id, submitted_at=now()
  where id=v_preflight.id;

  return jsonb_build_object(
    'id',v_sub_id,
    'risk_score',v_preflight.risk_score,
    'status',case when v_preflight.requires_attestation then 'suspicious' else 'active' end,
    'preflight_id',v_preflight.id
  );
end $$;

revoke all on function televoting.submit_vote_checked(uuid,text,text,jsonb,uuid,text,text,text,text,boolean) from public;
grant execute on function televoting.submit_vote_checked(uuid,text,text,jsonb,uuid,text,text,text,text,boolean) to anon, authenticated;

-- Prevent bypassing the new pre-submit integrity gate through the old RPC.
revoke execute on function televoting.submit_vote(uuid,text,text,jsonb,text,text,text,text,boolean) from anon, authenticated;

commit;
