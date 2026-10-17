begin;

-- Emergency Confirmation operations during the V3 browser maintenance window.
--
-- The browser remains globally maintenance-gated. Production's canonical platform
-- mode is also intentionally read_only, but Confirmation is the one contest domain
-- that must remain operational for organizers and delegations during this window.
-- Keep this exception domain-scoped: full `maintenance` mode remains stricter.
create or replace function private.studio2_capability_allowed_in_platform_mode(
  p_capability text,
  p_access_level text,
  p_mode text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case coalesce(p_mode, 'normal')
    when 'normal' then true
    when 'degraded' then true
    when 'read_only' then
      p_access_level = 'read'
      or p_capability in (
        'maintenance.manage',
        'incident.manage',
        'incident.resolve',
        'integrity.manage',
        'communications.send',
        'confirmation.manage'
      )
    when 'maintenance' then
      p_access_level = 'read'
      or p_capability in (
        'maintenance.manage',
        'incident.manage',
        'incident.resolve',
        'communications.send'
      )
    else false
  end;
$$;

create or replace function public.admin_update_confirmation_controls(
  _submission_id uuid,
  _editing_allowed boolean,
  _locked boolean,
  _admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_before public.submissions;
  v_after public.submissions;
  v_round public.submission_rounds;
  v_edition public.editions;
  v_country_id uuid;
  v_notes text := nullif(btrim(coalesce(_admin_notes, '')), '');
  v_changed boolean := false;
  v_revoked_tokens integer := 0;
begin
  if _submission_id is null then
    raise exception 'Submission id is required' using errcode = '22023';
  end if;

  select * into v_before from public.submissions where id = _submission_id for update;
  if v_before.id is null then raise exception 'Submission not found' using errcode = 'P0002'; end if;

  select * into v_round from public.submission_rounds where id = v_before.round_id;
  select * into v_edition from public.editions where id = v_before.edition_id;
  if v_round.id is null or v_edition.id is null then
    raise exception 'Confirmation response is missing its canonical round or edition' using errcode = '23503';
  end if;

  if not public.studio2_access_allowed('confirmation.manage', v_before.edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage for this edition' using errcode = '42501';
  end if;

  if coalesce(_editing_allowed, false) and coalesce(_locked, false) then
    raise exception 'A locked Confirmation response cannot be opened for editing' using errcode = '23514';
  end if;
  if coalesce(_editing_allowed, false) and not coalesce(v_round.editing_enabled, false) then
    raise exception 'Existing-response editing is disabled for this Confirmation round. Enable round editing without reopening submissions.' using errcode = '23514';
  end if;
  if coalesce(_editing_allowed, false) and not coalesce(v_edition.editing_enabled, false) then
    raise exception 'Confirmation editing is disabled for this edition' using errcode = '23514';
  end if;

  v_changed := v_before.editing_allowed is distinct from coalesce(_editing_allowed, false)
    or v_before.locked is distinct from coalesce(_locked, false)
    or v_before.admin_notes is distinct from v_notes;

  if v_changed then
    update public.submissions
    set editing_allowed = coalesce(_editing_allowed, false),
        locked = coalesce(_locked, false),
        admin_notes = v_notes,
        updated_at = now()
    where id = _submission_id
    returning * into v_after;
  else
    v_after := v_before;
  end if;

  if not coalesce(_editing_allowed, false) or coalesce(_locked, false) then
    with revoked as (
      update public.edit_tokens set active = false
      where submission_id = _submission_id and active = true returning 1
    ) select count(*)::integer into v_revoked_tokens from revoked;
  end if;

  select c.id into v_country_id
  from public.countries c
  where lower(btrim(c.name)) = lower(btrim(v_before.country))
     or lower(btrim(c.short_code)) = lower(btrim(v_before.country))
  order by case when lower(btrim(c.name)) = lower(btrim(v_before.country)) then 0 else 1 end
  limit 1;

  if v_changed then
    insert into public.admin_audit_log (
      actor_id, action, table_name, record_id, edition_id, country_id, before_data, after_data
    ) values (
      auth.uid(), 'confirmation_response_controls_updated', 'submissions', _submission_id::text,
      v_before.edition_id, v_country_id,
      jsonb_build_object('editingAllowed', v_before.editing_allowed, 'locked', v_before.locked, 'adminNotes', v_before.admin_notes, 'roundId', v_before.round_id),
      jsonb_build_object('editingAllowed', v_after.editing_allowed, 'locked', v_after.locked, 'adminNotes', v_after.admin_notes, 'roundId', v_after.round_id, 'roundStatus', v_round.status)
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'changed', v_changed, 'submissionId', _submission_id,
    'editionId', v_before.edition_id, 'roundId', v_before.round_id,
    'roundStatus', v_round.status, 'roundEditingEnabled', coalesce(v_round.editing_enabled, false),
    'editingAllowed', v_after.editing_allowed, 'locked', v_after.locked,
    'revokedEditTokens', v_revoked_tokens,
    'confirmationRequirementChanged', false, 'roundStatusChanged', false
  );
end;
$$;

create or replace function private.revoke_confirmation_tokens_on_submission_close()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if (not coalesce(new.editing_allowed, false)) or coalesce(new.locked, false) then
    update public.edit_tokens set active = false where submission_id = new.id and active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists revoke_confirmation_tokens_on_submission_close on public.submissions;
create trigger revoke_confirmation_tokens_on_submission_close
after insert or update of editing_allowed, locked on public.submissions
for each row when ((not coalesce(new.editing_allowed, false)) or coalesce(new.locked, false))
execute function private.revoke_confirmation_tokens_on_submission_close();

create or replace function private.revoke_confirmation_tokens_on_round_close()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if not coalesce(new.editing_enabled, false) then
    update public.edit_tokens t set active = false
    from public.submissions s
    where s.round_id = new.id and t.submission_id = s.id and t.active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists revoke_confirmation_tokens_on_round_close on public.submission_rounds;
create trigger revoke_confirmation_tokens_on_round_close
after insert or update of editing_enabled on public.submission_rounds
for each row when (not coalesce(new.editing_enabled, false))
execute function private.revoke_confirmation_tokens_on_round_close();

create or replace function private.revoke_confirmation_tokens_on_edition_close()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if not coalesce(new.editing_enabled, false) then
    update public.edit_tokens t set active = false
    from public.submissions s
    where s.edition_id = new.id and t.submission_id = s.id and t.active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists revoke_confirmation_tokens_on_edition_close on public.editions;
create trigger revoke_confirmation_tokens_on_edition_close
after insert or update of editing_enabled on public.editions
for each row when (not coalesce(new.editing_enabled, false))
execute function private.revoke_confirmation_tokens_on_edition_close();

revoke all on function public.admin_update_confirmation_controls(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.admin_update_confirmation_controls(uuid, boolean, boolean, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
