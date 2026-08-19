begin;

-- Human organizer decisions are deliberately separate from automatic preflight
-- warnings. An automatic flag never creates a misconduct finding or sanction.
create table if not exists televoting.vote_integrity_decisions (
  id uuid primary key default gen_random_uuid(),
  preflight_id uuid not null unique references televoting.vote_preflight_checks(id) on delete cascade,
  submission_id uuid references televoting.vote_submissions(id) on delete set null,
  decision text not null check (decision in ('cleared','monitor','false_declaration_confirmed','ballot_excluded')),
  reason text not null,
  evidence_notes text,
  organizer_id uuid,
  ballot_excluded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vote_integrity_decisions_decision_idx
  on televoting.vote_integrity_decisions(decision, updated_at desc);

-- Sanctions are always explicit organizer actions. Their scope deliberately
-- uses Solaris/HOD identity, never a real-world IP address or geolocation.
create table if not exists televoting.voter_sanctions (
  id uuid primary key default gen_random_uuid(),
  preflight_id uuid references televoting.vote_preflight_checks(id) on delete set null,
  source_decision_id uuid references televoting.vote_integrity_decisions(id) on delete set null,
  scope_type text not null check (scope_type in ('hod','country','username')),
  hod_person_id uuid,
  country_code text,
  username_normalized text,
  sanction_type text not null check (sanction_type in ('temporary','permanent')),
  active_from timestamptz not null default now(),
  expires_at timestamptz,
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  check (
    (scope_type='hod' and hod_person_id is not null)
    or (scope_type='country' and country_code is not null)
    or (scope_type='username' and username_normalized is not null)
  ),
  check (
    (sanction_type='permanent' and expires_at is null)
    or (sanction_type='temporary' and expires_at is not null)
  )
);

create index if not exists voter_sanctions_active_idx
  on televoting.voter_sanctions(active_from, expires_at, revoked_at);
create index if not exists voter_sanctions_hod_idx on televoting.voter_sanctions(hod_person_id) where hod_person_id is not null;
create index if not exists voter_sanctions_country_idx on televoting.voter_sanctions(upper(country_code)) where country_code is not null;
create index if not exists voter_sanctions_username_idx on televoting.voter_sanctions(lower(username_normalized)) where username_normalized is not null;

create table if not exists televoting.integrity_action_audit (
  id uuid primary key default gen_random_uuid(),
  preflight_id uuid references televoting.vote_preflight_checks(id) on delete set null,
  decision_id uuid references televoting.vote_integrity_decisions(id) on delete set null,
  sanction_id uuid references televoting.voter_sanctions(id) on delete set null,
  submission_id uuid references televoting.vote_submissions(id) on delete set null,
  action text not null,
  organizer_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists integrity_action_audit_created_idx
  on televoting.integrity_action_audit(created_at desc);

alter table televoting.vote_integrity_decisions enable row level security;
alter table televoting.voter_sanctions enable row level security;
alter table televoting.integrity_action_audit enable row level security;
revoke all on table televoting.vote_integrity_decisions from anon, authenticated;
revoke all on table televoting.voter_sanctions from anon, authenticated;
revoke all on table televoting.integrity_action_audit from anon, authenticated;

create or replace function televoting.integrity_sanction_matches(
  p_scope_type text,
  p_hod_person_id uuid,
  p_country_code text,
  p_username_normalized text,
  p_candidate_hod uuid,
  p_candidate_country text,
  p_candidate_username text
) returns boolean
language sql immutable set search_path=televoting,pg_temp as $$
  select case p_scope_type
    when 'hod' then p_hod_person_id is not null and p_candidate_hod is not null and p_hod_person_id=p_candidate_hod
    when 'country' then coalesce(upper(p_country_code),'')<>'' and upper(p_country_code)=upper(coalesce(p_candidate_country,''))
    when 'username' then coalesce(lower(p_username_normalized),'')<>'' and lower(p_username_normalized)=lower(coalesce(p_candidate_username,''))
    else false
  end;
$$;
revoke all on function televoting.integrity_sanction_matches(text,uuid,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function televoting.integrity_sanction_matches(text,uuid,text,text,uuid,text,text) to service_role;

create or replace function televoting.block_sanctioned_preflight()
returns trigger
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_sanction televoting.voter_sanctions%rowtype;
begin
  select * into v_sanction
  from televoting.voter_sanctions sanction
  where sanction.revoked_at is null
    and sanction.active_from<=now()
    and (sanction.expires_at is null or sanction.expires_at>now())
    and televoting.integrity_sanction_matches(
      sanction.scope_type,
      sanction.hod_person_id,
      sanction.country_code,
      sanction.username_normalized,
      new.hod_person_id,
      new.country_code,
      new.username_normalized
    )
  order by case sanction.sanction_type when 'permanent' then 0 else 1 end, sanction.created_at desc
  limit 1;

  if found then
    if v_sanction.sanction_type='permanent' then
      raise exception 'Your SSC televoting access is suspended by an organizer decision. Contact the SSC organizers if you believe this is incorrect.' using errcode='42501';
    else
      raise exception 'Your SSC televoting access is suspended until %. Contact the SSC organizers if you believe this is incorrect.', v_sanction.expires_at using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function televoting.block_sanctioned_preflight() from public, anon, authenticated;
grant execute on function televoting.block_sanctioned_preflight() to service_role;

drop trigger if exists trg_block_sanctioned_preflight on televoting.vote_preflight_checks;
create trigger trg_block_sanctioned_preflight
before insert on televoting.vote_preflight_checks
for each row execute function televoting.block_sanctioned_preflight();

-- Defense in depth: a sanction created after preflight but before final submit
-- still prevents the ballot from being inserted. No network/IP field participates
-- in sanction matching.
create or replace function televoting.block_sanctioned_submission()
returns trigger
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_hod uuid;
  v_sanction televoting.voter_sanctions%rowtype;
begin
  select check_row.hod_person_id into v_hod
  from televoting.vote_preflight_checks check_row
  where check_row.round_id=new.round_id
    and check_row.username_normalized=new.username_normalized
    and upper(check_row.country_code)=upper(new.country_code)
    and check_row.submitted_at is null
    and check_row.expires_at>now()
  order by check_row.created_at desc
  limit 1;

  select * into v_sanction
  from televoting.voter_sanctions sanction
  where sanction.revoked_at is null
    and sanction.active_from<=now()
    and (sanction.expires_at is null or sanction.expires_at>now())
    and televoting.integrity_sanction_matches(
      sanction.scope_type,
      sanction.hod_person_id,
      sanction.country_code,
      sanction.username_normalized,
      v_hod,
      new.country_code,
      new.username_normalized
    )
  limit 1;

  if found then
    raise exception 'Your SSC televoting access is suspended by an organizer decision.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function televoting.block_sanctioned_submission() from public, anon, authenticated;
grant execute on function televoting.block_sanctioned_submission() to service_role;

drop trigger if exists trg_block_sanctioned_submission on televoting.vote_submissions;
create trigger trg_block_sanctioned_submission
before insert on televoting.vote_submissions
for each row execute function televoting.block_sanctioned_submission();

create or replace function televoting.record_integrity_decision(
  p_preflight_id uuid,
  p_decision text,
  p_reason text,
  p_evidence_notes text,
  p_organizer_id uuid
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_preflight televoting.vote_preflight_checks%rowtype;
  v_decision televoting.vote_integrity_decisions%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if p_decision not in ('cleared','monitor','false_declaration_confirmed','ballot_excluded') then
    raise exception 'Unsupported integrity decision' using errcode='22023';
  end if;
  if length(v_reason)<5 then
    raise exception 'A meaningful organizer reason is required' using errcode='22023';
  end if;

  select * into v_preflight from televoting.vote_preflight_checks where id=p_preflight_id;
  if not found then raise exception 'Integrity declaration not found' using errcode='22023'; end if;
  if p_decision='false_declaration_confirmed' and v_preflight.attested_at is null then
    raise exception 'A false declaration cannot be confirmed when no declaration was signed' using errcode='22023';
  end if;
  if p_decision='ballot_excluded' and v_preflight.submission_id is null then
    raise exception 'There is no submitted ballot to exclude' using errcode='22023';
  end if;

  insert into televoting.vote_integrity_decisions(
    preflight_id,submission_id,decision,reason,evidence_notes,organizer_id,
    ballot_excluded_at,created_at,updated_at
  ) values (
    p_preflight_id,v_preflight.submission_id,p_decision,v_reason,nullif(trim(coalesce(p_evidence_notes,'')),''),p_organizer_id,
    case when p_decision='ballot_excluded' then now() else null end,now(),now()
  )
  on conflict (preflight_id) do update set
    submission_id=excluded.submission_id,
    decision=excluded.decision,
    reason=excluded.reason,
    evidence_notes=excluded.evidence_notes,
    organizer_id=excluded.organizer_id,
    ballot_excluded_at=case
      when excluded.decision='ballot_excluded' then coalesce(televoting.vote_integrity_decisions.ballot_excluded_at,now())
      else televoting.vote_integrity_decisions.ballot_excluded_at
    end,
    updated_at=now()
  returning * into v_decision;

  if p_decision='ballot_excluded' then
    update televoting.vote_submissions
    set status='deleted', deletion_category='integrity_moderation'
    where id=v_preflight.submission_id and status<>'deleted';

    insert into televoting.integrity_action_audit(preflight_id,decision_id,submission_id,action,organizer_id,reason,metadata)
    values(p_preflight_id,v_decision.id,v_preflight.submission_id,'ballot_excluded',p_organizer_id,v_reason,
      jsonb_build_object('preserved',true,'deletion_category','integrity_moderation'));
  end if;

  insert into televoting.integrity_action_audit(preflight_id,decision_id,submission_id,action,organizer_id,reason,metadata)
  values(p_preflight_id,v_decision.id,v_preflight.submission_id,'decision_recorded',p_organizer_id,v_reason,
    jsonb_build_object('decision',p_decision,'automatic_flag_is_not_decision',true));

  return jsonb_build_object('id',v_decision.id,'decision',v_decision.decision,'submission_id',v_decision.submission_id);
end;
$$;
revoke all on function televoting.record_integrity_decision(uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function televoting.record_integrity_decision(uuid,text,text,text,uuid) to service_role;

create or replace function televoting.create_integrity_sanction(
  p_preflight_id uuid,
  p_sanction_type text,
  p_expires_at timestamptz,
  p_reason text,
  p_organizer_id uuid
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_preflight televoting.vote_preflight_checks%rowtype;
  v_decision televoting.vote_integrity_decisions%rowtype;
  v_sanction televoting.voter_sanctions%rowtype;
  v_scope text;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if p_sanction_type not in ('temporary','permanent') then raise exception 'Unsupported sanction type' using errcode='22023'; end if;
  if length(v_reason)<8 then raise exception 'A detailed sanction reason is required' using errcode='22023'; end if;
  if p_sanction_type='temporary' and (p_expires_at is null or p_expires_at<=now()) then
    raise exception 'Temporary suspension requires a future end time' using errcode='22023';
  end if;
  if p_sanction_type='permanent' and p_expires_at is not null then
    raise exception 'Permanent bans do not use an expiry date' using errcode='22023';
  end if;

  select * into v_preflight from televoting.vote_preflight_checks where id=p_preflight_id;
  if not found then raise exception 'Integrity declaration not found' using errcode='22023'; end if;
  if v_preflight.attested_at is null then raise exception 'No signed declaration exists for this record' using errcode='22023'; end if;

  select * into v_decision from televoting.vote_integrity_decisions where preflight_id=p_preflight_id;
  if not found or v_decision.decision<>'false_declaration_confirmed' then
    raise exception 'An organizer must explicitly confirm a false declaration before imposing an SSC sanction' using errcode='22023';
  end if;

  v_scope := case when v_preflight.hod_person_id is not null then 'hod' when nullif(trim(v_preflight.country_code),'') is not null then 'country' else 'username' end;

  insert into televoting.voter_sanctions(
    preflight_id,source_decision_id,scope_type,hod_person_id,country_code,username_normalized,
    sanction_type,active_from,expires_at,reason,created_by
  ) values (
    p_preflight_id,v_decision.id,v_scope,
    case when v_scope='hod' then v_preflight.hod_person_id else null end,
    case when v_scope='country' then upper(v_preflight.country_code) else null end,
    case when v_scope='username' then lower(v_preflight.username_normalized) else null end,
    p_sanction_type,now(),case when p_sanction_type='temporary' then p_expires_at else null end,v_reason,p_organizer_id
  ) returning * into v_sanction;

  insert into televoting.integrity_action_audit(preflight_id,decision_id,sanction_id,submission_id,action,organizer_id,reason,metadata)
  values(p_preflight_id,v_decision.id,v_sanction.id,v_preflight.submission_id,'sanction_created',p_organizer_id,v_reason,
    jsonb_build_object('scope_type',v_scope,'sanction_type',p_sanction_type,'expires_at',v_sanction.expires_at));

  return jsonb_build_object('id',v_sanction.id,'scope_type',v_scope,'sanction_type',v_sanction.sanction_type,'expires_at',v_sanction.expires_at);
end;
$$;
revoke all on function televoting.create_integrity_sanction(uuid,text,timestamptz,text,uuid) from public, anon, authenticated;
grant execute on function televoting.create_integrity_sanction(uuid,text,timestamptz,text,uuid) to service_role;

create or replace function televoting.revoke_integrity_sanction(
  p_sanction_id uuid,
  p_reason text,
  p_organizer_id uuid
) returns jsonb
language plpgsql security definer set search_path=televoting,pg_temp as $$
declare
  v_sanction televoting.voter_sanctions%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if length(v_reason)<5 then raise exception 'A revocation reason is required' using errcode='22023'; end if;
  select * into v_sanction from televoting.voter_sanctions where id=p_sanction_id for update;
  if not found then raise exception 'Sanction not found' using errcode='22023'; end if;
  if v_sanction.revoked_at is not null then raise exception 'Sanction is already revoked' using errcode='22023'; end if;

  update televoting.voter_sanctions
  set revoked_at=now(),revoked_by=p_organizer_id,revocation_reason=v_reason
  where id=p_sanction_id
  returning * into v_sanction;

  insert into televoting.integrity_action_audit(preflight_id,decision_id,sanction_id,action,organizer_id,reason,metadata)
  values(v_sanction.preflight_id,v_sanction.source_decision_id,v_sanction.id,'sanction_revoked',p_organizer_id,v_reason,
    jsonb_build_object('ballot_restored',false));

  -- Revoking voting access never restores a previously excluded ballot.
  return jsonb_build_object('id',v_sanction.id,'revoked_at',v_sanction.revoked_at,'ballot_restored',false);
end;
$$;
revoke all on function televoting.revoke_integrity_sanction(uuid,text,uuid) from public, anon, authenticated;
grant execute on function televoting.revoke_integrity_sanction(uuid,text,uuid) to service_role;

commit;
