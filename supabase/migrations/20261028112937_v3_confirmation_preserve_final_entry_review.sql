begin;
select public.v3_register_migration_contract(
 'v3.entry.confirmation-final-review-guard',1,'forward_fix_only',false,null,
 'Preserve newer final canonical Entry decisions independently of the Confirmation source-revision metadata. Projection retry timestamps must not reopen a subsequently withdrawn or disqualified entry.'
);
do $guard$
declare
 v_definition text:=pg_get_functiondef('public.v3_sync_confirmation_entry(uuid)'::regprocedure);
 v_anchor text:=$anchor$  v_status := case when v_submission.participating then 'confirmed' else 'withdrawn' end;$anchor$;
begin
 if strpos(v_definition,'-- v3-final-entry-review-guard')>0 then return; end if;
 if strpos(v_definition,v_anchor)=0 then raise exception 'Unrecognized canonical Entry sync; final-review guard refused'; end if;
 v_definition:=replace(v_definition,v_anchor,v_anchor||$policy$
  -- v3-final-entry-review-guard: canonical review time and source revision
  -- serve different purposes. A projection retry must never reverse a later
  -- final Organizer decision merely because its stored source revision matches.
  if v_existing.id is not null and v_existing.status in ('withdrawn','disqualified')
     and v_existing.status is distinct from v_status
     and v_existing.updated_at > v_submission.updated_at then
    return jsonb_build_object('ok',false,'status','canonical_newer',
      'editionId',v_submission.edition_id,'countryId',v_country_id,'entryId',v_existing.id);
  end if;
$policy$);
 execute v_definition;
end
$guard$;
commit;
