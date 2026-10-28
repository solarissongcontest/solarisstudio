begin;
insert into public.countries(id,name,short_code)
values ('28112937-0000-4000-8000-000000000001','Final Review Testland','FRX');
insert into public.editions(id,name,slug,edition_number,status,published)
values ('28112937-0000-4000-8000-000000000011','Final review fixture','final-review-fixture',28112937,'active',false);
insert into public.submission_rounds(id,edition_id,name,status)
values ('28112937-0000-4000-8000-000000000021','28112937-0000-4000-8000-000000000011','Final review','closed');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method,updated_at)
values ('28112937-0000-4000-8000-000000000031','28112937-0000-4000-8000-000000000011','28112937-0000-4000-8000-000000000021','final_review','Final Review Testland',true,'internal',now()-interval '2 days');
insert into public.contest_entities(id,edition_id,country_id,entity_type,display_name,abbreviation)
values ('28112937-0000-4000-8000-000000000041','28112937-0000-4000-8000-000000000011','28112937-0000-4000-8000-000000000001','global','Final Review Testland','FRX');
insert into public.entries(edition_id,country_id,contest_entity_id,artist,song_title,status,source,metadata,updated_at)
values ('28112937-0000-4000-8000-000000000011','28112937-0000-4000-8000-000000000001','28112937-0000-4000-8000-000000000041','Original artist','Original song','disqualified','confirmations',jsonb_build_object('confirmation_submission_updated_at',now()-interval '2 days'),now()-interval '1 day');
set local role service_role;
do $review$
declare v_result jsonb;
begin
 v_result:=public.v3_sync_confirmation_entry('28112937-0000-4000-8000-000000000031');
 if v_result->>'status'<>'canonical_newer' or (v_result->>'ok')::boolean then raise exception 'Matching source revision overwrote newer final Entry review'; end if;
end
$review$;
reset role;
do $canonical$
begin
 if not exists(select 1 from public.entries where edition_id='28112937-0000-4000-8000-000000000011' and status='disqualified' and artist='Original artist' and song_title='Original song') then raise exception 'Final canonical Entry state was rewritten'; end if;
end
$canonical$;
rollback;
