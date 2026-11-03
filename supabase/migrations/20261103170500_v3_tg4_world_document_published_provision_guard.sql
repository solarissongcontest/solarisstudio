begin;

-- TG4 legal-history hardening. The original provision trigger validated only
-- the destination Version of UPDATE. A privileged service-role mutation could
-- therefore move a row *out of* a published Version into a draft. Both sides
-- of an UPDATE must be mutable drafts, or the transaction must fail.
create or replace function private.world_document_version_provision_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
  v_old_state text;
  v_new_state text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select publication_state into v_old_state
    from public.world_document_versions
    where id = old.document_version_id;

    if v_old_state is distinct from 'draft' then
      raise exception using
        errcode = '55000',
        message = 'PUBLISHED_DOCUMENT_VERSION_IMMUTABLE';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select publication_state into v_new_state
    from public.world_document_versions
    where id = new.document_version_id;

    if v_new_state is distinct from 'draft' then
      raise exception using
        errcode = '55000',
        message = 'PUBLISHED_DOCUMENT_VERSION_IMMUTABLE';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$guard$;

revoke all on function private.world_document_version_provision_mutation_guard()
  from public, anon, authenticated;

-- Preserve the existing trigger and its statement/order. CREATE OR REPLACE
-- updates the function it already invokes, without a race-prone trigger swap.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-published-provision-guard',
      1,
      'forward_fix_only',
      false,
      null,
      'Preserve immutable published legal history by validating both source and destination Version state for every provision UPDATE.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
