\set ON_ERROR_STOP on
begin;
insert into public.countries(name,short_code)
values ('QZ%Literal Search','QZP'),('QZ_Literal Search','QZU'),('QZXLiteral Search','QZX');
insert into public.countries(name,short_code)
select 'QZBounded Search '||i,'QZB'||i from generate_series(1,60) i;
set local role anon;
do $search$
declare v_count integer;
begin
  select count(*) into v_count from public.solaris_public_search('QZ%',50) where result_type='country';
  if v_count<>1 then raise exception 'Percent input broadened literal search: % countries',v_count; end if;
  select count(*) into v_count from public.solaris_public_search('QZ_',50) where result_type='country';
  if v_count<>1 then raise exception 'Underscore input broadened literal search: % countries',v_count; end if;
  select count(*) into v_count from public.solaris_public_search('QZBounded',500);
  if v_count<>50 then raise exception 'Search did not preserve the 50-result ceiling: %',v_count; end if;
  select count(*) into v_count from public.solaris_public_search('QZBounded',0);
  if v_count<>1 then raise exception 'Nonpositive search limit did not clamp to one'; end if;
  if exists(select 1 from public.solaris_public_search('%',50))
    or exists(select 1 from public.solaris_public_search(repeat('Q',121),50)) then
    raise exception 'Search admitted an out-of-bounds query';
  end if;
  if not exists(select 1 from public.solaris_public_search('  qz%  ',50) where result_type='country' and title='QZ%Literal Search') then
    raise exception 'Literal search lost trimmed case-insensitive matching';
  end if;
  raise notice 'PASS: anonymous literal percent/underscore, query bounds, bounded result count and normalized routing results';
end
$search$;
reset role;
rollback;
