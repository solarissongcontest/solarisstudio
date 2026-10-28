begin;
select public.v3_register_migration_contract(
 'v3.edition.runtime-direct-write-cutover',1,'forward_fix_only',false,null,
 'Edition runtime changes are owned by the receipt-bearing transition command and owner-only seed/transition implementations. Remove raw API DML while preserving readback and canonical SECURITY DEFINER execution.'
);
revoke insert,update,delete,truncate on public.studio2_edition_runtime
 from public,anon,authenticated,service_role;
commit;
