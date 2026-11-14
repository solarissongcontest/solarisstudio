\set ON_ERROR_STOP on
-- S08 post-restore acceptance, run only in the networkless observed-owner
-- fixture. The existing v3-voting-config-authority.sql (run BEFORE S08) still
-- proves exact weighted score/rank recalculation from its synthetic rows.
-- That fixture's manual aggregate INSERT MUST NOT be repeated after S08.
begin;
do $writer$ 
declare
  v_before bigint;
  v_after bigint;
  v_state text;
  v_message text;
begin
  select count(*) into v_before from public.televote_votes;
  begin
    insert into public.televote_votes(edition_id,show_id,country_id,points)
    values ('51000000-0000-4000-8000-000000000001',
            '51000000-0000-4000-8000-000000000002',
            '51000000-0000-4000-8000-000000000011',30);
    raise exception 'S08 allowed a direct owner aggregate INSERT';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    if v_state <> '42501'
       or v_message <> 'Official Televote totals are writable only by canonical source projection' then
      raise exception 'Post-S08 direct owner insertion wrong denial: % / %', v_state, v_message;
    end if;
  end;
  select count(*) into v_after from public.televote_votes;
  if v_before <> v_after then
    raise exception 'Rejected Televote owner write changed aggregate rows';
  end if;
end $writer$;
-- Voting configuration remains a legitimate show operation after S08.
-- No fabricated canonical vote source or aggregate is installed here.
update public.shows
set voting_config='{"weightedScoring":true,"weighting":{"jury":50,"televote":25},"tieBreak":["televote","jury"]}'::jsonb
where id='51000000-0000-4000-8000-000000000002';
do $compat$
begin
  if not exists(
    select 1 from public.shows
    where id='51000000-0000-4000-8000-000000000002'
      and voting_config #>> '{weighting,televote}' = '25'
  ) then
    raise exception 'S08 blocked a normal voting configuration edit';
  end if;
  if not exists(
    select 1 from private.v3_result_versions
    where show_id='51000000-0000-4000-8000-000000000002'
      and version=1 and result_row_count=5
  ) then
    raise exception 'S08 altered immutable historical Results evidence';
  end if;
end $compat$;
rollback;
select 'PASS: post-S08 restored owner cannot manually insert Televote totals; config and frozen Results remain usable';
