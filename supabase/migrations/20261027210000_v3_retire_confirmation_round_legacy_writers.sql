begin;

select public.v3_register_migration_contract(
  'v3.edition.retire-confirmation-round-legacy-writers',
  1,
  'forward_fix_only',
  false,
  null,
  'Retire the service-role-only legacy Confirmation round CRUD RPCs now that the Organizer path uses the canonical preview/apply command. This removes their incidental public.editions writer authority.'
);

create or replace function public.admin_confirmation_save_round(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use studio2_confirmation_round_change_preview and studio2_apply_confirmation_round_change'
    using errcode = '0A000';
end
$retired$;
revoke all on function public.admin_confirmation_save_round(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.admin_confirmation_delete_round(_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use studio2_confirmation_round_change_preview and studio2_apply_confirmation_round_change'
    using errcode = '0A000';
end
$retired$;
revoke all on function public.admin_confirmation_delete_round(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_confirmation_set_round_status(_id uuid, _status text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $retired$
begin
  raise exception 'LEGACY_RETIRED: use studio2_confirmation_round_change_preview and studio2_apply_confirmation_round_change'
    using errcode = '0A000';
end
$retired$;
revoke all on function public.admin_confirmation_set_round_status(uuid,text)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
