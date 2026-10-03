-- Make Confirmations round controls match what the organizer UI promises.
--
-- 1. Opening a round is an immediate action. A future opens_at is moved to now,
--    and an already-expired closes_at is cleared instead of leaving the round
--    effectively closed.
-- 2. A round-level corrections toggle is a real bulk control. Enabling it also
--    opens the edition compatibility gate and marks responses in the round as
--    editing_allowed. Per-response locks remain authoritative.
-- 3. Saving a round with editing enabled/disabled keeps existing response
--    editing_allowed flags in sync with that round-level choice.

create or replace function public.admin_confirmation_set_round_status(
  _id uuid,
  _status text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;

  if _status not in ('draft','open','closed','auto_closed') then
    raise exception 'Invalid round status' using errcode='22023';
  end if;

  select r.response_limit, count(s.id)::integer
  into v_limit, v_count
  from public.submission_rounds r
  left join public.submissions s on s.round_id = r.id
  where r.id = _id
  group by r.id, r.response_limit;

  if not found then
    return false;
  end if;

  if _status = 'open' and v_limit is not null and v_count >= v_limit then
    raise exception 'Increase the response limit before reopening this full round' using errcode='22023';
  end if;

  update public.submission_rounds
  set
    status = _status,
    opens_at = case
      when _status = 'open' and (opens_at is null or opens_at > now()) then now()
      else opens_at
    end,
    closes_at = case
      when _status = 'open' and closes_at is not null and closes_at <= now() then null
      else closes_at
    end
  where id = _id;

  return found;
end;
$$;

create or replace function public.admin_confirmation_set_round_editing(
  _id uuid,
  _enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_edition_id uuid;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;

  select r.edition_id
  into v_edition_id
  from public.submission_rounds r
  where r.id = _id
  for update;

  if v_edition_id is null then
    return false;
  end if;

  update public.submission_rounds
  set editing_enabled = _enabled
  where id = _id;

  if _enabled then
    update public.editions
    set editing_enabled = true
    where id = v_edition_id;
  end if;

  update public.submissions
  set
    editing_allowed = _enabled,
    updated_at = now()
  where round_id = _id
    and editing_allowed is distinct from _enabled;

  return true;
end;
$$;

create or replace function public.admin_confirmation_save_round(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_edition_id uuid := nullif(_payload ->> 'edition_id', '')::uuid;
  v_name text := nullif(btrim(_payload ->> 'name'), '');
  v_status text := coalesce(nullif(_payload ->> 'status', ''), 'draft');
  v_opens_at timestamptz := nullif(_payload ->> 'opens_at', '')::timestamptz;
  v_closes_at timestamptz := nullif(_payload ->> 'closes_at', '')::timestamptz;
  v_limit integer := nullif(_payload ->> 'response_limit', '')::integer;
  v_editing boolean := coalesce((_payload ->> 'editing_enabled')::boolean, false);
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;

  if v_edition_id is null or v_name is null then
    raise exception 'Edition and round name are required' using errcode='22023';
  end if;

  if v_status not in ('draft','open','closed','auto_closed') then
    raise exception 'Invalid round status' using errcode='22023';
  end if;

  if v_limit is not null and v_limit < 1 then
    raise exception 'Response limit must be positive' using errcode='22023';
  end if;

  if v_closes_at is not null and v_opens_at is not null and v_closes_at <= v_opens_at then
    raise exception 'Round closing time must be after opening time' using errcode='22023';
  end if;

  if v_status = 'open' and v_closes_at is not null and v_closes_at <= now() then
    raise exception 'An open round needs a future closing time or no closing time' using errcode='22023';
  end if;

  if v_id is null then
    insert into public.submission_rounds(
      edition_id,
      name,
      status,
      opens_at,
      closes_at,
      response_limit,
      editing_enabled
    ) values (
      v_edition_id,
      v_name,
      v_status,
      v_opens_at,
      v_closes_at,
      v_limit,
      v_editing
    )
    returning id into v_id;
  else
    update public.submission_rounds
    set
      edition_id = v_edition_id,
      name = v_name,
      status = v_status,
      opens_at = v_opens_at,
      closes_at = v_closes_at,
      response_limit = v_limit,
      editing_enabled = v_editing
    where id = v_id;

    if not found then
      raise exception 'Round not found' using errcode='22023';
    end if;
  end if;

  if v_editing then
    update public.editions
    set editing_enabled = true
    where id = v_edition_id;
  end if;

  update public.submissions
  set
    editing_allowed = v_editing,
    updated_at = now()
  where round_id = v_id
    and editing_allowed is distinct from v_editing;

  return v_id;
end;
$$;

revoke all on function public.admin_confirmation_set_round_status(uuid, text)
  from public, anon;
revoke all on function public.admin_confirmation_set_round_editing(uuid, boolean)
  from public, anon;
revoke all on function public.admin_confirmation_save_round(jsonb)
  from public, anon;

grant execute on function public.admin_confirmation_set_round_status(uuid, text)
  to authenticated, service_role;
grant execute on function public.admin_confirmation_set_round_editing(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.admin_confirmation_save_round(jsonb)
  to authenticated, service_role;
