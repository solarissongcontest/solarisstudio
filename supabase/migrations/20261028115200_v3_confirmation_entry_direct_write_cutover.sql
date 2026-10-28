begin;
select public.v3_register_migration_contract(
 'v3.confirmation.entry-direct-write-cutover',1,'forward_fix_only',false,null,
 'Participant, Organizer and recovery mutations already enter governed SECURITY DEFINER commands. Revoke residual API DML, including RLS-bypassing TRUNCATE, on Confirmation state and internal Entry versions; retain reads and exact RPC execution.'
);
revoke insert,update,delete,truncate on public.submission_rounds,public.submissions,
 public.submission_versions,public.studio2_confirmation_requirements,public.internal_entries
 from public,anon,authenticated,service_role;
commit;
