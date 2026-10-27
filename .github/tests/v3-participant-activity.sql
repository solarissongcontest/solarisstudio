-- Disposable loopback read-contract fixtures. The shared receipt API owns every
-- processing/completed/failed transition; no readiness or lifecycle state is patched.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('26000000-0000-4000-8000-000000000605','authenticated','authenticated','activity-owner@local.invalid',now(),now()),
 ('26000000-0000-4000-8000-000000000606','authenticated','authenticated','activity-organizer@local.invalid',now(),now());
insert into public.user_roles(user_id,role)
values ('26000000-0000-4000-8000-000000000606','organizer');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('26000000-0000-4000-8000-000000000610','Private historical activity edition',2026,'activity-recipient-history',2605,'active',false);
insert into public.submission_rounds(id,edition_id,name,status)
values ('26000000-0000-4000-8000-000000000611','26000000-0000-4000-8000-000000000610','Historical response fixture','draft');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method)
values ('26000000-0000-4000-8000-000000000612','26000000-0000-4000-8000-000000000610','26000000-0000-4000-8000-000000000611','activity-history','Historical country',true,'internal');
-- The normal content-version triggers create and retain both historical versions.
-- Ownerless bootstrap content does not invent production lifecycle events.
insert into public.internal_entries(id,submission_id,artist,song_title,song_url)
values ('26000000-0000-4000-8000-000000000613','26000000-0000-4000-8000-000000000612','Original activity artist','Private song','https://example.invalid/private-song');
select set_config('activity.old_version',(select current_version_id::text from public.internal_entries where id='26000000-0000-4000-8000-000000000613'),true);
update public.internal_entries set artist='Revised activity artist' where id='26000000-0000-4000-8000-000000000613';
select set_config('activity.current_version',(select current_version_id::text from public.internal_entries where id='26000000-0000-4000-8000-000000000613'),true);
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000605';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000605"}';

do $fixtures$
declare i integer; op uuid; version_id uuid; result jsonb;
begin
 for i in 1..3 loop
   op := ('26000000-0000-4000-8605-'||lpad(i::text,12,'0'))::uuid;
   version_id := case i when 1 then current_setting('activity.old_version')::uuid
      when 2 then current_setting('activity.current_version')::uuid
      else '26000000-0000-4000-8000-000000000699'::uuid end;
   perform private.studio2_claim_operation(op,op::text,op,'entry.submit','R1',
     jsonb_build_object('editionId','26000000-0000-4000-8000-000000000610'),jsonb_build_object('fixtureOrdinal',i));
   perform private.studio2_complete_operation(op,jsonb_build_object('entryVersionId',version_id,
     'privatePayload','ACTIVITY-SECRET-PAYLOAD','ranking',jsonb_build_array('ACTIVITY-SECRET-VOTE')));
 end loop;
 -- Unsuccessful operations and unrelated command families must never become participant activity.
 op := '26000000-0000-4000-8605-000000000004';
 perform private.studio2_claim_operation(op,op::text,op,'entry.submit','R1','{}','{"fixture":"processing"}');
 op := '26000000-0000-4000-8605-000000000005';
 perform private.studio2_claim_operation(op,op::text,op,'entry.submit','R1','{}','{"fixture":"failed"}');
 perform private.studio2_fail_operation(op,'VALIDATION','{}');
 op := '26000000-0000-4000-8605-000000000006';
 perform private.studio2_claim_operation(op,op::text,op,'rollout.change','R2','{}','{"fixture":"organizer-only"}');
 perform private.studio2_complete_operation(op,'{"privatePayload":"ACTIVITY-SECRET-ADMIN"}');
end
$fixtures$;

set local role authenticated;
do $recipient$
declare result jsonb; item jsonb; keys text[];
begin
 result := public.v3_my_participant_activity(null,30,null);
 if jsonb_array_length(result->'items') <> 3 then
   raise exception 'Activity leaked pending/failed/unrelated operations or lost canonical history: %',result;
 end if;
 if result::text like '%ACTIVITY-SECRET-%' or result::text like '%privatePayload%'
    or result::text like '%request_fingerprint%' or result::text like '%idempotency_key%' then
   raise exception 'Private operation request/result contents leaked into activity';
 end if;
 for item in select value from jsonb_array_elements(result->'items') loop
   select array_agg(key order by key) into keys from jsonb_object_keys(item) key;
   if keys <> array['country_id','description','edition_id','edition_label','id','kind','occurred_at','receipt_id','reconciliation_state','route','source_event_type','title'] then
     raise exception 'Activity exposed an unapproved field: %',keys;
   end if;
   if item->>'edition_id' <> '26000000-0000-4000-8000-000000000610'
      or item->>'edition_label' <> 'Private historical activity edition'
      or item->>'route' <> '/participate' or item->>'source_event_type' <> 'entry.version_changed' then
     raise exception 'Actor-owned historical identity or canonical route was replaced';
   end if;
   if item->>'reconciliation_state' <> (case item->>'id'
       when '26000000-0000-4000-8605-000000000001' then 'superseded'
       when '26000000-0000-4000-8605-000000000002' then 'current'
       else 'unavailable' end) then
     raise exception 'Activity reconciliation disagrees with canonical version truth: %',item;
   end if;
 end loop;

 begin
   perform public.v3_my_participant_activity(null,30,'26000000-0000-4000-8605-000000000001');
   raise exception 'Half cursor was accepted';
 exception when invalid_parameter_value then null;
 end;
 raise notice 'PASS: recipient-only historical activity, strict payload projection, current/superseded/unavailable truth';
end
$recipient$;
reset role;

-- Every completion in this one transaction has the same server timestamp.
-- This reproduces the timestamp-only cursor omission deterministically.
do $ties$
declare i integer; op uuid;
begin
 for i in 10..69 loop
   op := ('26000000-0000-4000-8605-'||lpad(i::text,12,'0'))::uuid;
   perform private.studio2_claim_operation(op,op::text,op,'entry.submit','R1','{}',jsonb_build_object('fixtureOrdinal',i));
   perform private.studio2_complete_operation(op,'{}');
 end loop;
end
$ties$;
set local role authenticated;
do $pages$
declare result jsonb; next_page jsonb; ids text[] := '{}'; id text; loops integer := 0;
begin
 result := public.v3_my_participant_activity(null,999,null);
 if jsonb_array_length(result->'items') <> 50 or result->>'next_before' is null or result->>'next_operation_id' is null then
   raise exception 'Activity is unbounded or omitted its stable tie-break cursor';
 end if;
 result := public.v3_my_participant_activity(null,7,null);
 loop
   loops := loops+1;
   for id in select value->>'id' from jsonb_array_elements(result->'items') loop
     if id=any(ids) then raise exception 'Keyset pagination duplicated an operation'; end if;
     ids := array_append(ids,id);
   end loop;
   exit when result->>'next_before' is null;
   if loops>20 then raise exception 'Keyset pagination did not converge'; end if;
   next_page := public.v3_my_participant_activity((result->>'next_before')::timestamptz,7,(result->>'next_operation_id')::uuid);
   result := next_page;
 end loop;
 if cardinality(ids) <> 63 then raise exception 'Equal-timestamp pagination skipped canonical operations: %',cardinality(ids); end if;
 if jsonb_array_length(public.v3_my_participant_activity(null,0,null)->'items') <> 1 then
   raise exception 'Activity minimum page bound was not enforced';
 end if;
 raise notice 'PASS: bounded 50-row reads, exact same-timestamp keyset pagination, no duplicate or missing operations';
end
$pages$;
reset role;

-- Organizer status must not widen the personal projection to another actor.
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000606';
set local request.jwt.claims='{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000606"}';
set local role authenticated;
do $peer$
begin
 if jsonb_array_length(public.v3_my_participant_activity(null,50,null)->'items') <> 0 then
   raise exception 'Organizer activity read widened to another actor';
 end if;
end
$peer$;
reset role;
set local request.jwt.claim.sub='';
set local request.jwt.claim.role='anon';
set local request.jwt.claims='{"role":"anon"}';
set local role anon;
do $anonymous$
begin
 begin
   perform public.v3_my_participant_activity(null,30,null);
   raise exception 'Anonymous activity read succeeded';
 exception when insufficient_privilege then null;
 end;
end
$anonymous$;
reset role;

-- Reads preserve canonical receipts, immutable history and DomainEvent/outbox state.
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000605';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"role":"authenticated","sub":"26000000-0000-4000-8000-000000000605"}';
do $stable$
declare before_hash text; after_hash text;
begin
 select md5(jsonb_build_array(
   (select jsonb_agg(to_jsonb(r) order by r.operation_id) from public.studio2_operation_receipts r),
   (select count(*) from private.v3_domain_events),(select count(*) from private.v3_domain_event_outbox),
   (select jsonb_agg(to_jsonb(v) order by v.id) from private.v3_entry_versions v))::text) into before_hash;
 perform public.v3_my_participant_activity(null,50,null);
 perform public.v3_my_participant_activity(null,50,null);
 select md5(jsonb_build_array(
   (select jsonb_agg(to_jsonb(r) order by r.operation_id) from public.studio2_operation_receipts r),
   (select count(*) from private.v3_domain_events),(select count(*) from private.v3_domain_event_outbox),
   (select jsonb_agg(to_jsonb(v) order by v.id) from private.v3_entry_versions v))::text) into after_hash;
 if before_hash is distinct from after_hash then raise exception 'Activity read mutated canonical truth'; end if;
 if (select provolatile from pg_proc where oid='public.v3_my_participant_activity(timestamptz,integer,uuid)'::regprocedure) <> 's' then
   raise exception 'Activity projection is not STABLE';
 end if;
 if has_function_privilege('service_role','public.v3_my_participant_activity(timestamptz,integer,uuid)','execute') then
   raise exception 'Service role was accidentally granted recipient projection access';
 end if;
 raise notice 'PASS: anonymous denial, Organizer isolation, STABLE read, unchanged receipts/history/events/outbox';
end
$stable$;
rollback;
