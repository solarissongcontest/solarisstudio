begin;

-- S13 contract: forward-only privacy hardening for the staged National Final
-- winner intent. The legacy anonymous submission lookup must never reveal a
-- participant's pending winner before canonical review/publication.
do $contract$
begin
  if to_regprocedure(
       'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
     ) is not null then
    execute $registration$
      select public.v3_register_migration_contract(
        'v3.confirmation.pending-nf-winner-public-redaction',
        1,
        'forward_fix_only',
        false,
        null,
        'Redact pending National Final winner intent from the legacy anonymous submission lookup so participant-declared winner state cannot leak before exact review and publication.'
      )
    $registration$;
  end if;
end
$contract$;

create or replace function public.public_lookup_submission(_round_id uuid, _country text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.submissions;
  internal_data jsonb;
  nf_data jsonb;
begin
  select * into s
  from public.submissions
  where round_id = _round_id
    and lower(country) = lower(trim(_country))
  limit 1;

  if s is null then
    return jsonb_build_object('exists', false);
  end if;

  if s.locked then
    return jsonb_build_object('exists', true, 'can_edit', false);
  end if;

  select to_jsonb(i) into internal_data
  from public.internal_entries i
  where i.submission_id = s.id
  limit 1;

  select case
    when nf.id is null then null
    else (to_jsonb(nf) - 'pending_winning_entry_id') || jsonb_build_object(
      'national_final_entries',
      coalesce((
        select jsonb_agg(to_jsonb(e) order by e.position)
        from public.national_final_entries e
        where e.national_final_id = nf.id
      ), '[]'::jsonb)
    )
  end into nf_data
  from public.national_finals nf
  where nf.submission_id = s.id
  limit 1;

  return jsonb_build_object(
    'exists', true,
    'can_edit', true,
    'submission', to_jsonb(s) || jsonb_build_object(
      'internal_entries', internal_data,
      'national_finals', nf_data
    )
  );
end;
$$;

revoke all on function public.public_lookup_submission(uuid, text) from public;
grant execute on function public.public_lookup_submission(uuid, text) to anon, authenticated, service_role;

commit;
