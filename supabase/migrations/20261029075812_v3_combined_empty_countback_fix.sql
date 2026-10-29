begin;
select public.v3_register_migration_contract('v3.televote.combined-empty-countback-fix',1,'forward_fix_only',false,null,'Treat absent voting component arrays as empty in activity-only Combined countback; preserve numeric distribution ordering.');
create or replace function private.v3_combined_countback(a jsonb,b jsonb) returns integer
language plpgsql immutable set search_path=pg_catalog,private as $$
declare k text; i integer; diff integer; x numeric; y numeric;
begin
 foreach k in array array['points','allocated','voting','activity','raw_scores','distributions','display_order'] loop
  if k in ('allocated','raw_scores','distributions') then
   for i in 0..coalesce(jsonb_array_length(nullif(a->k,'null'::jsonb)),0)-1 loop
    if k='distributions' then diff:=private.v3_combined_distribution_compare(a->k->i,b->k->i);
    else x:=(a->k->>i)::numeric; y:=(b->k->>i)::numeric; diff:=case when x>y then -1 when x<y then 1 else 0 end; end if;
    if diff<>0 then return diff; end if;
   end loop;
  else
   x:=(a->>k)::numeric; y:=(b->>k)::numeric;
   if x<>y then return case when (x>y)=(k<>'display_order') then -1 else 1 end; end if;
  end if;
 end loop;
 return case when a->>'country_code'<b->>'country_code' then -1 when a->>'country_code'>b->>'country_code' then 1 else 0 end;
end $$;
revoke all on function private.v3_combined_countback(jsonb,jsonb) from public,anon,authenticated,service_role;
commit;
