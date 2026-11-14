\set ON_ERROR_STOP on
update public.shows set voting_config='{"juryEnabled":true,"televoteEnabled":false,"juryPoints":[12],"allowSelfVote":false}'::jsonb where id='51000000-0000-4000-8000-000000000002';
insert into public.jury_voting_windows(show_id,edition_id,status,opened_at)values('51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','open',now());
insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at)
values('52000000-0000-4000-8000-000000000010',null,'mixed.name','SR11','{"51000000-0000-4000-8000-000000000012":12}','jury','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000001',now()+interval '1 hour');
