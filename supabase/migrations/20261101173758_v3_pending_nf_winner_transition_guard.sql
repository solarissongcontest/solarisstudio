begin;

-- S13 contract: forward-only authorization hardening for the staged National
-- Final winner intent introduced by the preceding Confirmation hotfix.
do $contract$
begin
  if to_regprocedure(
       'public.v3_register_migration_contract(text,integer,text,boolean,text,text)'
     ) is not null then
    execute $registration$
      select public.v3_register_migration_contract(
        'v3.confirmation.pending-nf-winner-transition-guard',
        1,
        'forward_fix_only',
        false,
        null,
        'Apply the existing direct Confirmation review-transition guard to pending National Final winner intent as well as the canonical reviewed winner, preventing browser roles from mutating staged winner state outside canonical RPC operations.'
      )
    $registration$;
  end if;
end
$contract$;

-- The table intentionally retains capability-managed UPDATE privileges for
-- canonical Organizer surfaces. Ensure the new pending winner column cannot be
-- mutated directly by anon/authenticated callers any more than winning_entry_id
-- can; security-definer participant/Organizer operations remain the only writer.
drop trigger if exists studio2_guard_nf_winner_transition
  on public.national_finals;
create trigger studio2_guard_nf_winner_transition
before update of winning_entry_id, pending_winning_entry_id
on public.national_finals
for each row execute function private.studio2_guard_direct_confirmation_review_transition();

commit;
