-- LOCAL fixture correction only. Reproduce full observed ACL order/fingerprints;
-- no production privilege change or new effective grant is proposed here.
begin;
do $local$ begin
 if current_database()<>'recovery_operator_baseline' or current_user<>'postgres' then raise exception 'Observed ACL fixture is restricted to named disposable DB';end if;
end $local$;
revoke all on function public.show_publication_enabled(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.show_publication_enabled(uuid,text) to anon,authenticated,service_role;
revoke all on function public.studio2_access_allowed(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.studio2_access_allowed(text,uuid,boolean) to authenticated,service_role,anon;
commit;
