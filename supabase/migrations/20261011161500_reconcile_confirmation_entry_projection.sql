begin;

-- Reconcile stale canonical entry projections created from Confirmations.
--
-- The canonical sync path already copies accepted artist/song/media fields, but
-- historical rows can predate that behavior or have been projected before the
-- winning entry review was accepted. Fill only missing canonical fields from an
-- accepted authoritative source. Never replace a non-empty Solaris value.
--
-- This intentionally supports both provenance shapes we have had in production:
-- source_ref may point directly at the accepted entry, or metadata may retain
-- only the Confirmation submission id while the accepted entry is resolved via
-- that submission.

with accepted_candidates as (
  select
    canonical.id as entry_id,
    internal_entry.id as source_id,
    internal_entry.artist,
    internal_entry.song_title,
    internal_entry.song_url,
    case when canonical.source_ref = internal_entry.id::text then 0 else 1 end as priority
  from public.entries canonical
  join public.internal_entries internal_entry
    on canonical.source_ref = internal_entry.id::text
    or (
      canonical.selection_method = 'internal'
      and internal_entry.submission_id::text = canonical.metadata ->> 'confirmation_submission_id'
    )
  where canonical.source = 'confirmations'
    and internal_entry.review_status = 'accepted'

  union all

  select
    canonical.id as entry_id,
    national_entry.id as source_id,
    national_entry.artist,
    national_entry.song_title,
    national_entry.song_url,
    case when canonical.source_ref = national_entry.id::text then 0 else 1 end as priority
  from public.entries canonical
  join public.national_finals national_final
    on canonical.source_ref = national_final.winning_entry_id::text
    or (
      canonical.selection_method = 'national_final'
      and national_final.submission_id::text = canonical.metadata ->> 'confirmation_submission_id'
    )
  join public.national_final_entries national_entry
    on national_entry.id = national_final.winning_entry_id
  where canonical.source = 'confirmations'
    and national_entry.review_status = 'accepted'
    and coalesce(national_entry.removed, false) = false
),
accepted_source as (
  select distinct on (candidate.entry_id)
    candidate.entry_id,
    candidate.source_id,
    nullif(btrim(candidate.artist), '') as artist,
    nullif(btrim(candidate.song_title), '') as song_title,
    nullif(btrim(candidate.song_url), '') as song_url
  from accepted_candidates candidate
  order by candidate.entry_id, candidate.priority, candidate.source_id
),
reconciled as (
  update public.entries canonical
  set
    artist = coalesce(nullif(btrim(canonical.artist), ''), accepted.artist),
    song_title = coalesce(nullif(btrim(canonical.song_title), ''), accepted.song_title),
    song_url = coalesce(nullif(btrim(canonical.song_url), ''), accepted.song_url),
    metadata = case
      when coalesce(nullif(btrim(canonical.artist), ''), accepted.artist) is not null
       and coalesce(nullif(btrim(canonical.song_title), ''), accepted.song_title) is not null
        then coalesce(canonical.metadata, '{}'::jsonb) - 'awaiting_official_entry'
      else canonical.metadata
    end,
    updated_at = now()
  from accepted_source accepted
  where canonical.id = accepted.entry_id
    and (
      (nullif(btrim(canonical.artist), '') is null and accepted.artist is not null)
      or (nullif(btrim(canonical.song_title), '') is null and accepted.song_title is not null)
      or (nullif(btrim(canonical.song_url), '') is null and accepted.song_url is not null)
      or (
        coalesce(canonical.metadata, '{}'::jsonb) ? 'awaiting_official_entry'
        and coalesce(nullif(btrim(canonical.artist), ''), accepted.artist) is not null
        and coalesce(nullif(btrim(canonical.song_title), ''), accepted.song_title) is not null
      )
    )
  returning canonical.edition_id, canonical.country_id, canonical.artist, canonical.song_title
)
update public.participants participant
set
  artist = coalesce(nullif(btrim(participant.artist), ''), reconciled.artist),
  song = coalesce(nullif(btrim(participant.song), ''), reconciled.song_title),
  updated_at = now()
from reconciled
where participant.edition_id = reconciled.edition_id
  and participant.country_id = reconciled.country_id
  and participant.show_id is null
  and (
    (nullif(btrim(participant.artist), '') is null and reconciled.artist is not null)
    or (nullif(btrim(participant.song), '') is null and reconciled.song_title is not null)
  );

commit;
