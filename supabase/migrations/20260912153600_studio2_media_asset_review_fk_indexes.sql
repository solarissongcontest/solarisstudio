begin;

-- Phase 9 stores organizer review decisions separately from canonical media.
-- Cover the standalone foreign keys that are not leftmost prefixes of the
-- existing edition/asset operational indexes so FK validation and parent-row
-- maintenance do not degrade into full-table scans as review history grows.
create index if not exists studio2_media_asset_reviews_country_id_idx
  on public.studio2_media_asset_reviews (country_id);

create index if not exists studio2_media_asset_reviews_entry_id_idx
  on public.studio2_media_asset_reviews (entry_id);

create index if not exists studio2_media_asset_reviews_reviewed_by_idx
  on public.studio2_media_asset_reviews (reviewed_by);

commit;
