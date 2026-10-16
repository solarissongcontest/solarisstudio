begin;

-- System V3 S5 publication convergence.
--
-- Clean migration replay still carried the original August publication/result
-- projection trigger chain even though the long-lived production schema no
-- longer has those helpers. That legacy chain re-authorized internal derived
-- projection work with publishing.manage / results.verify after the canonical
-- publication command had already authorized publishing.publish. Besides being
-- duplicate authority, it meant a legitimate release-only operator could be
-- rejected by a hidden downstream side effect.
--
-- Keep the later canonical projection paths:
--   * shows_sync_edition_publication -> sync_edition_publication_from_shows()
--   * jury_votes_sync_results / televote_votes_sync_results
-- and retire only the replay-only predecessor chain.

do $verify_replacements$
begin
  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.shows'::regclass
      and trigger_row.tgname = 'shows_sync_edition_publication'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Canonical show -> edition publication projection trigger is missing';
  end if;

  if to_regprocedure('public.sync_edition_publication_from_shows()') is null then
    raise exception 'Canonical show -> edition publication projection function is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.jury_votes'::regclass
      and trigger_row.tgname = 'jury_votes_sync_results'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Canonical jury -> results projection trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.televote_votes'::regclass
      and trigger_row.tgname = 'televote_votes_sync_results'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Canonical televote -> results projection trigger is missing';
  end if;
end
$verify_replacements$;

drop trigger if exists trg_sync_edition_publication_after_show_change on public.shows;
drop trigger if exists trg_refresh_results_when_show_published on public.shows;
drop trigger if exists trg_refresh_results_after_participant_change on public.participants;
drop trigger if exists trg_refresh_results_after_jury_change on public.jury_votes;
drop trigger if exists trg_refresh_results_after_televote_change on public.televote_votes;

drop function if exists public.sync_edition_publication_after_show_change();
drop function if exists public.sync_one_edition_publication(uuid);
drop function if exists public.refresh_public_results_after_show_change();
drop function if exists public.refresh_public_results_after_child_change();
drop function if exists public.refresh_show_results(uuid);

-- Fail closed if clean replay ever reintroduces one half of the legacy chain.
do $verify_retirement$
begin
  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgname in (
      'trg_sync_edition_publication_after_show_change',
      'trg_refresh_results_when_show_published',
      'trg_refresh_results_after_participant_change',
      'trg_refresh_results_after_jury_change',
      'trg_refresh_results_after_televote_change'
    )
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Legacy publication/result projection trigger survived S5 cutover';
  end if;

  if to_regprocedure('public.sync_edition_publication_after_show_change()') is not null
     or to_regprocedure('public.sync_one_edition_publication(uuid)') is not null
     or to_regprocedure('public.refresh_public_results_after_show_change()') is not null
     or to_regprocedure('public.refresh_public_results_after_child_change()') is not null
     or to_regprocedure('public.refresh_show_results(uuid)') is not null then
    raise exception 'Legacy publication/result projection helper survived S5 cutover';
  end if;
end
$verify_retirement$;

commit;
