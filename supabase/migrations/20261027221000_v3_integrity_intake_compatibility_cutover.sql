begin;

select public.v3_register_migration_contract(
  'v3.integrity.intake-compatibility-cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'Route legacy case-intake RPCs through canonical retry-safe V3 commands instead of calling internal writer primitives directly'
);

create or replace function public.public_create_anonymous_integrity_case(
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null,
  _case_kind text default 'report'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $compat$
declare
  v_operation uuid := extensions.gen_random_uuid();
  v_key text;
begin
  v_key := encode(
    extensions.digest(
      convert_to('integrity-case-anonymous-compat:' || v_operation::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return public.v3_public_create_anonymous_integrity_case(
    v_operation,
    v_key,
    _category,
    _summary,
    _details,
    _observed_facts,
    _uncertainties,
    coalesce(_related_countries, '{}'::text[]),
    _edition_reference,
    _case_kind
  );
end
$compat$;

create or replace function public.create_protected_integrity_case(
  _identity_mode text,
  _case_kind text,
  _category text,
  _summary text,
  _details text,
  _observed_facts text default null,
  _uncertainties text default null,
  _related_countries text[] default '{}',
  _edition_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $compat$
declare
  v_operation uuid := extensions.gen_random_uuid();
  v_key text;
begin
  v_key := encode(
    extensions.digest(
      convert_to('integrity-case-protected-compat:' || v_operation::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  return public.v3_create_protected_integrity_case(
    v_operation,
    v_key,
    _identity_mode,
    _case_kind,
    _category,
    _summary,
    _details,
    _observed_facts,
    _uncertainties,
    coalesce(_related_countries, '{}'::text[]),
    _edition_reference
  );
end
$compat$;

revoke all on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text)
  from public;
grant execute on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text)
  to anon, authenticated, service_role;

revoke all on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text)
  from public, anon;
grant execute on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text)
  to authenticated, service_role;

comment on function public.public_create_anonymous_integrity_case(text, text, text, text, text, text[], text, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy anonymous Integrity intake UI. Reason: preserve existing caller signature while canonical V3 intake is adopted. Sunset: remove after all participant intake callers use v3_public_create_anonymous_integrity_case with caller-stable operation/idempotency identity.';
comment on function public.create_protected_integrity_case(text, text, text, text, text, text, text, text[], text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy authenticated/sealed Integrity intake UI. Reason: preserve existing caller signature while canonical V3 intake is adopted. Sunset: remove after all participant intake callers use v3_create_protected_integrity_case with caller-stable operation/idempotency identity.';

comment on function public.reporter_submit_integrity_appeal(uuid, uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy protected reporter appeal UI. Reason: preserve existing caller signature. Sunset: remove after callers use v3_submit_integrity_appeal with stable operation/idempotency identity.';
comment on function public.public_submit_anonymous_integrity_appeal(text, text, uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: legacy anonymous appeal UI. Reason: preserve existing caller signature. Sunset: remove after callers use v3_public_submit_anonymous_integrity_appeal with stable operation/idempotency identity.';
comment on function public.admin_update_integrity_case_status(uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: current Organizer Integrity case workflow. Reason: preserve existing Organizer RPC contract. Sunset: remove after Organizer sends stable operation/idempotency identity and expected case revision to studio2_integrity_case_transition.';
comment on function public.admin_assign_integrity_reviewer(uuid, uuid, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: current Organizer Integrity case reviewer workflow. Reason: preserve existing Organizer RPC contract. Sunset: remove after Organizer uses studio2_integrity_assign_case_reviewer with stable operation/idempotency identity and expected revision.';
comment on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: current Organizer appeal review workflow. Reason: preserve existing Organizer RPC contract. Sunset: remove after Organizer uses studio2_integrity_assign_appeal_reviewer with stable operation/idempotency identity and expected revision.';
comment on function public.admin_decide_integrity_appeal(uuid, text, text, integer, text[], text[]) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: current Organizer appeal decision workflow. Reason: preserve existing Organizer RPC contract. Sunset: remove after Organizer uses studio2_integrity_resolve_appeal with stable operation/idempotency identity and expected revision.';
comment on function public.admin_grant_integrity_appeal_extension(uuid, timestamptz, text) is
  'TEMPORARY COMPATIBILITY PATH. Owner: Integrity authority. Scope: current Organizer appeal extension workflow. Reason: preserve existing Organizer RPC contract. Sunset: remove after Organizer uses studio2_integrity_grant_appeal_extension with stable operation/idempotency identity and expected revision.';

notify pgrst, 'reload schema';
commit;
