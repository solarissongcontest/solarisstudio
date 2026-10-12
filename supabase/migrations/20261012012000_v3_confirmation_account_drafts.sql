begin;

-- Signed-in country accounts need a draft identity that survives device changes.
-- Anonymous drafts intentionally remain browser-session scoped; there is no safe
-- cross-device anonymous identity to bind official contest data to.

create table if not exists private.v3_confirmation_account_drafts (
  round_id uuid not null references public.submission_rounds(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, country_id),
  constraint v3_confirmation_account_drafts_revision_positive check (revision >= 1)
);

revoke all on table private.v3_confirmation_account_drafts
  from public, anon, authenticated;
grant all on table private.v3_confirmation_account_drafts to service_role;

create or replace function private.v3_confirmation_account_country_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $country$
  select account.country_id
  from public.country_accounts account
  where account.user_id = auth.uid()
    and account.status = 'active'
  order by account.created_at asc nulls last, account.country_id
  limit 1;
$country$;

revoke all on function private.v3_confirmation_account_country_id()
  from public, anon, authenticated;

create or replace function public.v3_load_account_confirmation_draft(
  _round_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $load$
declare
  v_country_id uuid := private.v3_confirmation_account_country_id();
  v_draft private.v3_confirmation_account_drafts%rowtype;
begin
  if auth.uid() is null or v_country_id is null then
    raise exception 'Country account authentication required' using errcode = '42501';
  end if;
  if _round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;

  select draft.*
  into v_draft
  from private.v3_confirmation_account_drafts draft
  where draft.round_id = _round_id
    and draft.country_id = v_country_id;

  if not found then
    return jsonb_build_object(
      'found', false,
      'revision', 0,
      'country_id', v_country_id
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'payload', v_draft.payload,
    'revision', v_draft.revision,
    'updated_at', v_draft.updated_at,
    'country_id', v_country_id
  );
end
$load$;

revoke all on function public.v3_load_account_confirmation_draft(uuid)
  from public, anon;
grant execute on function public.v3_load_account_confirmation_draft(uuid)
  to authenticated, service_role;

create or replace function public.v3_save_account_confirmation_draft(
  _round_id uuid,
  _payload jsonb,
  _expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_country_id uuid := private.v3_confirmation_account_country_id();
  v_expected bigint := coalesce(_expected_revision, 0);
  v_existing private.v3_confirmation_account_drafts%rowtype;
  v_saved private.v3_confirmation_account_drafts%rowtype;
begin
  if auth.uid() is null or v_country_id is null then
    raise exception 'Country account authentication required' using errcode = '42501';
  end if;
  if _round_id is null then
    raise exception 'Confirmation round id is required' using errcode = '22023';
  end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'Confirmation draft payload must be a JSON object' using errcode = '22023';
  end if;
  if v_expected < 0 then
    raise exception 'Confirmation draft revision cannot be negative' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'v3-confirmation-account-draft:' || _round_id::text || ':' || v_country_id::text,
      0
    )
  );

  select draft.*
  into v_existing
  from private.v3_confirmation_account_drafts draft
  where draft.round_id = _round_id
    and draft.country_id = v_country_id
  for update;

  if found then
    if v_existing.revision <> v_expected then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', v_existing.revision,
        'payload', v_existing.payload,
        'updated_at', v_existing.updated_at,
        'country_id', v_country_id
      );
    end if;

    update private.v3_confirmation_account_drafts draft
    set
      payload = _payload,
      revision = draft.revision + 1,
      updated_at = now()
    where draft.round_id = _round_id
      and draft.country_id = v_country_id
    returning draft.* into v_saved;
  else
    if v_expected <> 0 then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', 0,
        'payload', null,
        'updated_at', null,
        'country_id', v_country_id
      );
    end if;

    insert into private.v3_confirmation_account_drafts (
      round_id,
      country_id,
      payload,
      revision,
      created_at,
      updated_at
    ) values (
      _round_id,
      v_country_id,
      _payload,
      1,
      now(),
      now()
    )
    returning * into v_saved;
  end if;

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'revision', v_saved.revision,
    'saved_at', v_saved.updated_at,
    'country_id', v_country_id
  );
end
$save$;

revoke all on function public.v3_save_account_confirmation_draft(uuid, jsonb, bigint)
  from public, anon;
grant execute on function public.v3_save_account_confirmation_draft(uuid, jsonb, bigint)
  to authenticated, service_role;

create or replace function public.v3_delete_account_confirmation_draft(
  _round_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $delete$
declare
  v_country_id uuid := private.v3_confirmation_account_country_id();
  v_deleted integer;
begin
  if auth.uid() is null or v_country_id is null then
    raise exception 'Country account authentication required' using errcode = '42501';
  end if;

  delete from private.v3_confirmation_account_drafts draft
  where draft.round_id = _round_id
    and draft.country_id = v_country_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted > 0);
end
$delete$;

revoke all on function public.v3_delete_account_confirmation_draft(uuid)
  from public, anon;
grant execute on function public.v3_delete_account_confirmation_draft(uuid)
  to authenticated, service_role;

commit;