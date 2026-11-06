begin;

-- Terra Solaris Governance TG1.
-- public.country_accounts remains the sole CURRENT controller authority.
-- This migration adds durable historical controller identity around it.

create table if not exists public.world_country_control_terms (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete restrict,
  person_id uuid not null references public.delegation_people(id) on delete restrict,
  user_id uuid null references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  start_edition_id uuid null references public.editions(id) on delete set null,
  end_edition_id uuid null references public.editions(id) on delete set null,
  source text not null,
  reason_started text null,
  reason_ended text null,
  created_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_country_control_terms_source_not_blank check (length(btrim(source)) between 1 and 80),
  constraint world_country_control_terms_revision_positive check (revision >= 1),
  constraint world_country_control_terms_time_order check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists world_country_control_terms_one_open_per_country
  on public.world_country_control_terms(country_id) where ended_at is null;
create unique index if not exists world_country_control_terms_country_revision_uidx
  on public.world_country_control_terms(country_id, revision);
create index if not exists world_country_control_terms_person_idx
  on public.world_country_control_terms(person_id, started_at desc);
create index if not exists world_country_control_terms_user_idx
  on public.world_country_control_terms(user_id, started_at desc) where user_id is not null;

alter table public.world_country_control_terms enable row level security;
revoke all on table public.world_country_control_terms from public, anon, authenticated;
grant select on table public.world_country_control_terms to authenticated;
grant all on table public.world_country_control_terms to service_role;

drop policy if exists world_country_control_terms_read on public.world_country_control_terms;
create policy world_country_control_terms_read on public.world_country_control_terms
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.studio2_access_allowed('delegation.read', null, false)
);

create or replace function private.world_resolve_controller_person(p_country_id uuid, p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $resolve$
  select dha.person_id
  from public.country_hod_edition_claims claim
  join public.delegation_hod_assignments dha
    on dha.country_id = claim.country_id and dha.edition_id = claim.edition_id
  join public.editions e on e.id = claim.edition_id
  where claim.country_id = p_country_id
    and claim.user_id = p_user_id
    and claim.status = 'mine'
  order by e.edition_number desc nulls last, dha.updated_at desc, dha.id desc
  limit 1
$resolve$;
revoke all on function private.world_resolve_controller_person(uuid, uuid) from public, anon, authenticated;

-- Backfill only links already proven by existing country-account + HoD history.
-- Missing durable-person links stay unresolved instead of being guessed.
insert into public.world_country_control_terms (
  country_id, person_id, user_id, started_at, start_edition_id, source, reason_started, revision
)
select
  ca.country_id,
  private.world_resolve_controller_person(ca.country_id, ca.user_id),
  ca.user_id,
  ca.created_at,
  (
    select claim.edition_id
    from public.country_hod_edition_claims claim
    join public.delegation_hod_assignments dha
      on dha.country_id = claim.country_id and dha.edition_id = claim.edition_id
    join public.editions e on e.id = claim.edition_id
    where claim.country_id = ca.country_id
      and claim.user_id = ca.user_id
      and claim.status = 'mine'
    order by e.edition_number desc nulls last, dha.updated_at desc, dha.id desc
    limit 1
  ),
  'country_accounts_backfill',
  'Initial Terra Solaris governance adoption from existing canonical country ownership.',
  1
from public.country_accounts ca
where ca.status = 'active'
  and private.world_resolve_controller_person(ca.country_id, ca.user_id) is not null
  and not exists (
    select 1 from public.world_country_control_terms existing
    where existing.country_id = ca.country_id and existing.ended_at is null
  )
on conflict do nothing;

-- Public-safe country/world identity projection. It deliberately never returns
-- auth user ids; durable delegation_people identity survives account deletion.
create or replace function public.world_country_identity_v1(p_country_id uuid default null)
returns table (
  country_id uuid,
  country_name text,
  short_code text,
  native_name text,
  controller_person_id uuid,
  controller_display_name text,
  control_started_at timestamptz,
  capital text,
  government_type text,
  leader_name text,
  leader_title text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $projection$
  select
    c.id, c.name, c.short_code, c.native_name,
    term.person_id, person.display_name, term.started_at,
    profile.capital, profile.government_type, profile.leader_name, profile.leader_title
  from public.countries c
  left join public.country_profiles profile on profile.country_id = c.id
  left join public.world_country_control_terms term
    on term.country_id = c.id and term.ended_at is null
  left join public.delegation_people person on person.id = term.person_id
  where p_country_id is null or c.id = p_country_id
  order by c.name, c.id
$projection$;
revoke all on function public.world_country_identity_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_country_identity_v1(uuid) to anon, authenticated, service_role;

-- R2 command to resolve/bind the durable person for an EXISTING current owner.
-- It never writes country_accounts and therefore cannot become a second owner.
create or replace function public.world_bind_country_controller_person_v1(
  p_country_id uuid,
  p_person_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_current_user_id uuid default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $bind$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current_user_id uuid;
  v_existing public.world_country_control_terms%rowtype;
  v_revision bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('delegation.manage', null, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_country_id is null or p_person_id is null or v_reason is null or length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.country_control.bind_person',
    'R2',
    jsonb_build_object('countryId', p_country_id, 'subjectType', 'country'),
    jsonb_build_object('countryId', p_country_id, 'personId', p_person_id,
      'expectedCurrentUserId', p_expected_current_user_id, 'reason', v_reason)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  -- country_accounts remains sole current controller authority. A
  -- suspended/inactive account may have a historical row but must not gain a
  -- newly bound *current* political identity through this command.
  select ca.user_id into v_current_user_id
  from public.country_accounts ca
  where ca.country_id = p_country_id
    and ca.status = 'active'
  for update;
  if v_current_user_id is null then
    raise exception using errcode = 'P0002', message = 'STATE_CHANGED';
  end if;
  if p_expected_current_user_id is not null and v_current_user_id is distinct from p_expected_current_user_id then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if not exists (select 1 from public.delegation_people person where person.id = p_person_id) then
    raise exception using errcode = '23503', message = 'VALIDATION';
  end if;

  select term.* into v_existing
  from public.world_country_control_terms term
  where term.country_id = p_country_id and term.ended_at is null
  for update;

  if v_existing.id is not null
     and v_existing.person_id = p_person_id
     and v_existing.user_id is not distinct from v_current_user_id then
    v_result := jsonb_build_object('ok', true, 'changed', false, 'countryId', p_country_id,
      'personId', p_person_id, 'revision', v_existing.revision, 'operationId', v_operation_id);
    perform private.studio2_complete_operation(v_operation_id, v_result);
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
  end if;

  select coalesce(max(term.revision), 0) + 1 into v_revision
  from public.world_country_control_terms term where term.country_id = p_country_id;

  if v_existing.id is not null then
    update public.world_country_control_terms
    set ended_at = now(), reason_ended = 'Superseded by explicit durable controller-person binding.'
    where id = v_existing.id;
  end if;

  insert into public.world_country_control_terms (
    country_id, person_id, user_id, started_at, source, reason_started, revision
  ) values (
    p_country_id, p_person_id, v_current_user_id, now(),
    'world_bind_country_controller_person_v1', v_reason, v_revision
  );

  perform private.v3_emit_domain_event(
    'world.country_control_linked', 'world_country_control', p_country_id::text,
    v_revision, v_operation_id, null, null,
    jsonb_build_object('countryId', p_country_id, 'personId', p_person_id, 'revision', v_revision),
    1, array[]::text[]
  );

  v_result := jsonb_build_object('ok', true, 'changed', true, 'countryId', p_country_id,
    'personId', p_person_id, 'revision', v_revision, 'operationId', v_operation_id);
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$bind$;
revoke all on function public.world_bind_country_controller_person_v1(uuid, uuid, text, uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.world_bind_country_controller_person_v1(uuid, uuid, text, uuid, text, uuid, uuid)
  to authenticated, service_role;

comment on table public.world_country_control_terms is
  'Durable historical Terra Solaris country-controller terms. Current authority remains public.country_accounts.';

-- S13 semantic adoption contract.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg1.world-country-control-foundation', 1, 'forward_fix_only', false, null,
      'Add durable country-control history around country_accounts, a public-safe country identity projection, and receipted durable-person binding without replacing canonical current ownership.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
