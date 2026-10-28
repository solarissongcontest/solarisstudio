begin;
select public.v3_register_migration_contract(
  'v3.jury.direct-write-cutover',1,'forward_fix_only',false,null,
  'All repository Jury mutations use SECURITY DEFINER commands. Remove raw API/service DML on ballots, votes, windows and versions, preserve reads, pin the ballot primitive and make it inaccessible except through the receipt-bearing V3 command.'
);
revoke insert,update,delete,truncate on public.jury_voting_windows,
  public.jury_ballot_submissions,public.jury_votes,public.studio2_jury_window_versions
  from public,anon,authenticated,service_role;
alter function public.submit_country_jury_ballot(uuid,jsonb,uuid)
  set search_path = pg_catalog,public,televoting;
revoke all on function public.submit_country_jury_ballot(uuid,jsonb,uuid)
  from public,anon,authenticated,service_role;
commit;
