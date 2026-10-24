begin;

-- S9/S10 review hardening after the Jury operation wrapper landed.
-- Keep the canonical wrapper as the only executable participant mutation path,
-- and classify all supported Televote deadline mutations as voting transitions.

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.s9-s10.acl-classifier-repairs',
  1,
  'forward_fix_only',
  false,
  null,
  'Close direct service-role execution of renamed Jury internals and include canonical Televote deadline mutations in voting-transition observability.'
);
select set_config('request.jwt.claim.role', '', true);

-- ALTER FUNCTION RENAME preserves the old ACL. The preceding migration revoked
-- browser roles but service_role inherited EXECUTE from the original writer.
-- The SECURITY DEFINER wrapper is owned by the database owner and does not need
-- service_role to retain a direct bypass around the canonical S2 boundary.
revoke all on function public.v3_submit_jury_ballot_legacy_impl(uuid, jsonb, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.v3_reconcile_jury_submission_legacy_impl(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.v3_observability_workflow_class(
  p_command text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $workflow$
  select case
    when p_command = 'confirmation.submit'
      or p_command like 'confirmation.submit.%'
      then 'confirmation_submission'
    when p_command like 'entry.%'
      then 'entry_mutation'
    when p_command like 'media.%'
      then 'media_review_consequence'
    when p_command in (
        'jury.open',
        'jury.close',
        'televote.open',
        'televote.close',
        'televote.deadline.change',
        'televote.deadline.set',
        'televote.extend'
      )
      or p_command like 'jury.window.%'
      or p_command like 'televote.window.%'
      or p_command like 'jury.round.%'
      or p_command like 'televote.round.%'
      or p_command like 'voting.%'
      then 'voting_round_transition'
    when p_command = 'jury.submit'
      or p_command like 'jury.submit.%'
      then 'jury_submission'
    when p_command = 'televote.submit'
      or p_command like 'televote.submit.%'
      then 'televote_submission'
    when p_command like 'results.%'
      or p_command like 'result.%'
      then 'results_lifecycle'
    when p_command like 'publication.%'
      then 'publication'
    when p_command like 'notification.%'
      or p_command like 'notice.delivery.%'
      then 'notification_consequence'
    else null
  end
$workflow$;

revoke all on function private.v3_observability_workflow_class(text)
  from public, anon, authenticated;
grant execute on function private.v3_observability_workflow_class(text)
  to service_role;

comment on function private.v3_observability_workflow_class(text) is
  'S9 fixed low-cardinality workflow classifier. Televote deadline changes are voting-round transitions; participant Jury submissions remain their own measured class.';

commit;
