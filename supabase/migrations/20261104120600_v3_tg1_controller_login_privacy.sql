begin;

-- TG1 country control history is durable political identity, but user_id is
-- private login linkage. Existing delegation.read grants (often scoped to a
-- contest edition) must not become a blanket read of unrelated login IDs.
-- Public historical identity continues through world_country_identity_v1.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg1.world-country-controller-login-privacy',
      1,
      'forward_fix_only',
      false,
      null,
      'Limit raw durable country-controller login linkage to the linked account or platform-authorized staff; preserve public history through safe projections.'
    );
  end if;
end
$contract$;

drop policy if exists world_country_control_terms_read
  on public.world_country_control_terms;

create policy world_country_control_terms_read
on public.world_country_control_terms
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.studio2_access_allowed('system.manage', null, false)
);

comment on policy world_country_control_terms_read
on public.world_country_control_terms is
  'Raw historical login linkage is visible only to its linked login or platform-authorized staff; delegation.read is insufficient.';

notify pgrst, 'reload schema';
commit;
