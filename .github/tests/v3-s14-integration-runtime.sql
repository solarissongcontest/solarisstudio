-- Isolated local Supabase only. Exercise actual runtime roles, never postgres
-- as a substitute for the app. All evidence fixtures roll back.
begin;
do $test$
declare v_table text;
begin
  foreach v_table in array array['public.televoting_round_bindings','public.integration_events'] loop
    if not (select relrowsecurity from pg_class where oid=v_table::regclass) then
      raise exception 'RLS disabled on %', v_table;
    end if;
    if has_table_privilege('anon',v_table,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Anonymous integration access must remain denied: %',v_table;
    end if;
  end loop;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='televoting_round_bindings'
      and qual like '%studio2_access_allowed%voting.manage%'
      and with_check like '%studio2_access_allowed%voting.manage%'
  ) then raise exception 'Edition-scoped voting.manage binding policy missing'; end if;
end
$test$;
set local role service_role;
set local request.jwt.claim.role='service_role';
-- The exact previously denied read and freeze write, without changing a lineup.
select remote_round_id from public.televoting_round_bindings where false;
update public.televoting_round_bindings set frozen_at=now() where false;
insert into public.integration_events(service,event_type,entity_type,remote_id,payload_hash,status)
values ('televoting','runtime.access.regression','show','local-regression','s14-integration-runtime-regression','pending')
on conflict (service,event_type,payload_hash) do update set status=excluded.status;
-- The second upsert proves replay/update access, not just first insertion.
insert into public.integration_events(service,event_type,entity_type,remote_id,payload_hash,status)
values ('televoting','runtime.access.regression','show','local-regression','s14-integration-runtime-regression','completed')
on conflict (service,event_type,payload_hash) do update set status=excluded.status;
do $test$
begin
  if (select count(*) from public.integration_events where payload_hash='s14-integration-runtime-regression' and status='completed')<>1 then
    raise exception 'Service integration evidence replay did not reconcile';
  end if;
end
$test$;
reset role;
rollback;
