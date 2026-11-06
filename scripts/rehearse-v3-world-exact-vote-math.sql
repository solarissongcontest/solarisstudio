-- Disposable LOCAL PostgreSQL only. No fixtures, users or data writes.
begin;
do $verify$
declare v jsonb;
begin
  v := private.world_legislative_tally_v1(8,2,5,20,1,2,'simple_majority',null,null,'all_cast_including_abstentions');
  if v->>'outcome' <> 'passed' or (v->>'approvalDenominator')::numeric <> 15 or (v->>'abstainCount')::bigint <> 5 then
    raise exception 'Abstentions must count in simple-majority denominator';
  end if;
  v := private.world_legislative_tally_v1(7,3,5,20,1,2,'simple_majority',null,null,'all_cast_including_abstentions');
  if v->>'outcome' <> 'failed' then raise exception '7/15 must fail simple majority'; end if;
  v := private.world_legislative_tally_v1(2,0,0,4,1,2,'simple_majority',null,null,'all_cast_including_abstentions');
  if v->>'outcome' <> 'passed' then raise exception 'Exact-half quorum incorrectly rejected'; end if;
  v := private.world_legislative_tally_v1(2,0,0,5,1,2,'simple_majority',null,null,'all_cast_including_abstentions');
  if v->>'outcome' <> 'no_quorum' or (v->>'thresholdMet')::boolean is distinct from true then
    raise exception 'Below-quorum result must not pass even when approval threshold met';
  end if;
  v := private.world_legislative_tally_v1(10,0,5,15,1,2,'fraction',2,3,'all_cast_including_abstentions');
  if v->>'outcome' <> 'passed' then raise exception '10/15 must meet exact two thirds'; end if;
  v := private.world_legislative_tally_v1(9,0,6,15,1,2,'fraction',2,3,'all_cast_including_abstentions');
  if v->>'outcome' <> 'failed' then raise exception '9/15 must fail exact two thirds'; end if;
  v := private.world_legislative_tally_v1(3,0,1,4,1,2,'fraction',3,4,'all_cast_including_abstentions');
  if v->>'outcome' <> 'passed' then raise exception '3/4 must meet exactly three fourths'; end if;
  v := private.world_legislative_tally_v1(3,0,1,4,1,2,'unanimity',null,null,'all_cast_including_abstentions');
  if v->>'outcome' <> 'failed' then raise exception 'Abstention must prevent unanimity'; end if;
  v := private.world_legislative_tally_v1(0,0,0,0,1,2,'unanimity',null,null,'all_cast_including_abstentions');
  if v->>'outcome' <> 'no_quorum' or (v->>'thresholdMet')::boolean is distinct from false then
    raise exception 'Empty electorate must fail closed';
  end if;
  v := private.world_legislative_tally_v1(9223372036854775807,0,0,9223372036854775807,1,2,'fraction',2,3,'all_cast_including_abstentions');
  if v->>'outcome' <> 'passed' then raise exception 'Bigint-limit tally overflowed or rounded'; end if;
  begin
    perform private.world_legislative_tally_v1(-1,0,0,1,1,2,'unanimity',null,null,'all_cast_including_abstentions');
    raise exception 'Negative vote count accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform private.world_legislative_tally_v1(2,0,0,1,1,2,'unanimity',null,null,'all_cast_including_abstentions');
    raise exception 'Excess/duplicate ballots accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform private.world_legislative_tally_v1(1,0,0,1,0,2,'unanimity',null,null,'all_cast_including_abstentions');
    raise exception 'Zero quorum fraction accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform private.world_legislative_tally_v1(1,0,0,1,1,2,'fraction',2,0,'all_cast_including_abstentions');
    raise exception 'Zero threshold denominator accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform private.world_legislative_tally_v1(1,0,0,1,1,2,'unanimity',null,null,'present_and_voting');
    raise exception 'Unknown denominator policy accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform private.world_legislative_tally_v1(1,0,0,1,1,2,'unknown',null,null,'all_cast_including_abstentions');
    raise exception 'Unknown threshold kind accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform private.world_legislative_tally_v1(null,0,0,1,1,2,'unanimity',null,null,'all_cast_including_abstentions');
    raise exception 'NULL vote count accepted';
  exception when sqlstate '22023' then null; end;
end
$verify$;
-- An ordinary authenticated role must not invoke the internal tally.
set local role authenticated;
do $deny$
begin
  begin
    perform private.world_legislative_tally_v1(1,0,0,1,1,2,'unanimity',null,null,'all_cast_including_abstentions');
    raise exception 'Private TG8 math leaked to authenticated client';
  exception when insufficient_privilege then null; end;
end
$deny$;
reset role;
-- Service role is an operational credential, not canonical voting authority.
set local role service_role;
do $deny$
begin
  begin
    perform private.world_legislative_tally_v1(1,0,0,1,1,2,'unanimity',null,null,'all_cast_including_abstentions');
    raise exception 'Private TG8 math leaked to service_role direct Data API';
  exception when insufficient_privilege then null; end;
end
$deny$;
reset role;
rollback;
