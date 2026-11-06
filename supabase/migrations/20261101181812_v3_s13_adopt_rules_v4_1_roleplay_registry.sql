begin;

-- Forward-register the semantic S13 contract for the already-applied
-- Rules v4.1 Chapter 22 registry migration without rewriting immutable
-- migration history. Production may intentionally lag the S13 contract
-- framework, so execute the registration only when that framework exists.
do $contract$
begin
  if to_regprocedure(
       'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
     ) is not null then
    execute $registration$
      select public.v3_register_migration_contract(
        'v3.rules.v4-1-roleplay-registry',
        1,
        'forward_fix_only',
        false,
        null,
        'Register SSC General Regulations v4.1 Chapter 22 rule identifiers 22.1 through 22.11 for Official Interpretations validation without rewriting historical rule identifiers.'
      )
    $registration$;
  end if;
end
$contract$;

commit;
