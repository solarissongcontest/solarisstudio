#!/usr/bin/env bash
set -euo pipefail

run_s14_stage_1_setup() {
  log "Stage 1/10: setup one deterministic bounded contest"

  db_exec "
insert into public.countries (id, name, short_code, region)
select
  $country_uuid_sql,
  'S14 Delegation ' || lpad(i::text, 2, '0'),
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  'S14'
from generate_series(1, 66) i
on conflict (id) do update set
  name = excluded.name,
  short_code = excluded.short_code,
  region = excluded.region;

insert into public.editions (id, name, slug, edition_number, year, status, published)
values ('$EDITION_ID', 'S14 Full Contest Rehearsal', 's14-full-contest', 1400, 2026, 'active', false)
on conflict (id) do update set
  name=excluded.name, slug=excluded.slug, edition_number=excluded.edition_number,
  year=excluded.year, status=excluded.status, published=false;

insert into public.shows (id, edition_id, name, kind, sort_order, published, voting_config, publication_config)
values
  ('$SEMI_ONE_ID', '$EDITION_ID', 'S14 Semi-final 1', 'semi-final', 1, false,
   '{\"juryEnabled\":true,\"allowSelfVote\":false,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1]}'::jsonb,
   '{\"participants\":true,\"artists\":true,\"songs\":true,\"running_order\":true,\"results\":false}'::jsonb),
  ('$SEMI_TWO_ID', '$EDITION_ID', 'S14 Semi-final 2', 'semi-final', 2, false,
   '{\"juryEnabled\":true,\"allowSelfVote\":false,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1]}'::jsonb,
   '{\"participants\":true,\"artists\":true,\"songs\":true,\"running_order\":true,\"results\":false}'::jsonb),
  ('$FINAL_ID', '$EDITION_ID', 'S14 Grand Final', 'grand-final', 3, false,
   '{\"juryEnabled\":true,\"allowSelfVote\":false,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1]}'::jsonb,
   '{\"participants\":true,\"artists\":true,\"songs\":true,\"running_order\":true,\"results\":true,\"jury_results\":true,\"televote_results\":true}'::jsonb)
on conflict (id) do update set voting_config=excluded.voting_config, publication_config=excluded.publication_config, published=false;

-- The legacy shows_sync_edition_publication trigger intentionally derives an
-- unpublished edition back to draft whenever its show rows are seeded. S14 is
-- rehearsing the live pre-publication participation lifecycle, so restore the
-- fixture's explicit operational state only after all unpublished shows exist.
-- Publication remains false until the later publication stage owns that change.
update public.editions
set status='active', published=false
where id='$EDITION_ID'::uuid;

insert into public.participants (id, edition_id, show_id, country_id, artist, song, running_order, participation_status)
select
  $participant_uuid_sql,
  '$EDITION_ID'::uuid,
  case when i <= 33 then '$SEMI_ONE_ID'::uuid else '$SEMI_TWO_ID'::uuid end,
  $country_uuid_sql,
  'S14 Artist ' || lpad(i::text, 2, '0'),
  'S14 Song ' || lpad(i::text, 2, '0'),
  case when i <= 33 then i else i - 33 end,
  'confirmed'
from generate_series(1, 66) i
on conflict (id) do update set artist=excluded.artist, song=excluded.song, running_order=excluded.running_order, participation_status='confirmed';

insert into public.submission_rounds (id, edition_id, name, status, opens_at, closes_at, editing_enabled)
values
  ('$CONFIRMATION_ROUND_ID', '$EDITION_ID', 'S14 Confirmation', 'open', now()-interval '15 minutes', now()+interval '6 hours', true),
  ('$LATE_ROUND_ID', '$EDITION_ID', 'S14 Late Confirmation', 'closed', now()-interval '2 days', now()-interval '1 day', false)
on conflict (id) do update set status=excluded.status, opens_at=excluded.opens_at, closes_at=excluded.closes_at, editing_enabled=excluded.editing_enabled;

insert into public.jury_voting_windows (show_id, edition_id, status)
values ('$FINAL_ID', '$EDITION_ID', 'closed')
on conflict (show_id) do update set edition_id=excluded.edition_id, status='closed', opened_at=null, closed_at=null;

insert into televoting.editions (id, name, is_active, is_archived)
values ('$TV_EDITION_ID', 'S14 Full Contest Rehearsal', true, false)
on conflict (id) do update set name=excluded.name, is_active=true, is_archived=false;

insert into televoting.countries(code, name, flag)
select
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  'S14 Delegation ' || lpad(i::text, 2, '0'),
  '✦'
from generate_series(1,66) i
on conflict (code) do update set name=excluded.name;

insert into televoting.rounds(id, edition_id, name, status, total_points_to_distribute, participant_mode, self_voting_mode)
values ('$TV_ROUND_ID', '$TV_EDITION_ID', 'S14 Grand Final Televote', 'draft', 58, 'countries', 'country_match')
on conflict (id) do update set name=excluded.name, status='draft', total_points_to_distribute=58, participant_mode='countries', self_voting_mode='country_match';

delete from televoting.round_countries where round_id='$TV_ROUND_ID'::uuid;
insert into televoting.round_countries(round_id, country_code, display_order)
select '$TV_ROUND_ID'::uuid,
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X', i
from generate_series(1,66) i;

delete from televoting.round_entries where round_id='$TV_ROUND_ID'::uuid;
insert into televoting.round_entries(round_id, entry_type, entry_key, country_code, short_name, entry_code, display_order)
select '$TV_ROUND_ID'::uuid, 'country',
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X',
  'S14 ' || lpad(i::text,2,'0'),
  chr(65 + ((i - 1) / 26)) || chr(65 + ((i - 1) % 26)) || 'X', i
from generate_series(1,66) i;

insert into public.ssc_rulebook_releases(id, version, status, is_current, title, summary, base_version, effective_from, published_at)
values ('$RULEBOOK_ID', '14.0', 'published', false, 'S14 rehearsal rules', 'Deterministic local-only rules fixture for the full-contest rehearsal.', '4.0', now(), now())
on conflict (id) do update set title=excluded.title, summary=excluded.summary, status='published', is_current=false;

insert into public.studio2_storylines(id, edition_id, title, subtitle, introduction, status, revision, source_event_count)
values ('$STORYLINE_ID', '$EDITION_ID', 'S14 contest story', 'Full lifecycle rehearsal', 'Local-only deterministic storyline.', 'draft', 1, 0)
on conflict (edition_id) do update set title=excluded.title, subtitle=excluded.subtitle, introduction=excluded.introduction, status='draft', published_at=null;
"

  [[ "$(db_scalar "select count(*) from public.countries where region='S14';")" == "66" ]] || fail "S14 seed does not contain exactly 66 delegations"
  [[ "$(db_scalar "select count(*) from public.shows where edition_id='$EDITION_ID'::uuid;")" == "3" ]] || fail "S14 seed does not contain three shows"
  [[ "$(db_scalar "select count(*) from public.participants where edition_id='$EDITION_ID'::uuid;")" == "66" ]] || fail "S14 seed does not contain 66 canonical participant rows"
  [[ "$(db_scalar "select status from public.editions where id='$EDITION_ID'::uuid;")" == "active" ]] || fail "S14 operational edition was demoted from active during setup"
  [[ "$(db_scalar "select published::text from public.editions where id='$EDITION_ID'::uuid;")" == "false" ]] || fail "S14 pre-publication fixture became public during setup"
  [[ "$(db_scalar "select public.round_availability('$CONFIRMATION_ROUND_ID'::uuid)->>'reason';")" == "OPEN" ]] || fail "S14 confirmation round is not accepting submissions after setup"
  [[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$TV_ROUND_ID'::uuid;")" == "66" ]] || fail "S14 televote configuration does not contain 66 entries"
  [[ "$(db_scalar "select count(*) from public.ssc_rulebook_releases where id='$RULEBOOK_ID'::uuid and status='published';")" == "1" ]] || fail "S14 rule configuration missing"
  [[ "$(db_scalar "select count(*) from public.studio2_storylines where edition_id='$EDITION_ID'::uuid;")" == "1" ]] || fail "S14 storyline seed missing"
  log "S14_STAGE_1_SETUP_COMPLETE"
}