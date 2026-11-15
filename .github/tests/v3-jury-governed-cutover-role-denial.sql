\set ON_ERROR_STOP on
-- Actual API LOGIN session; rollback-only, isolated fixture.
begin;
do $test$
declare identity text;actor text;operation text;statement text;denied boolean;
begin
 if session_user<>'authenticator' then raise exception 'Actual API session required';end if;
 foreach identity in array array['public.jury_voting_windows','public.jury_ballot_submissions','public.jury_votes','public.jury_ballot_statuses','public.studio2_jury_window_versions','private.v3_jury_drafts','private.v3_jury_operations']loop
  foreach actor in array array['anon','authenticated','service_role']loop
   foreach operation in array array['insert','update','delete','truncate']loop
    statement:=case operation when 'insert' then 'insert into '||identity||' default values'
     when 'update' then 'update '||identity||' set '||(case when identity='private.v3_jury_drafts' then 'payload=payload' when identity='private.v3_jury_operations' then 'state_version=state_version' when identity='public.jury_votes' then 'points=points' when identity='public.studio2_jury_window_versions' then 'version=version' else 'show_id=show_id' end)||' where false'
     when 'delete' then 'delete from '||identity||' where false' else 'truncate '||identity end;
    execute format('set local role %I',actor);denied:=false;
    begin execute statement;exception when insufficient_privilege then denied:=true;end;
    reset role;
    if not denied then raise exception 'Direct Jury write accepted: % % %',identity,actor,operation;end if;
   end loop;
  end loop;
 end loop;
end $test$;
rollback;
