begin;

-- Cover the standalone foreign-key lookups that are not leftmost prefixes of
-- the Phase 7 operational indexes. This keeps country/user deletion and FK
-- validation work from falling back to full-table scans as override history grows.
create index if not exists studio2_eligibility_overrides_country_id_idx
  on public.studio2_eligibility_overrides (country_id);

create index if not exists studio2_eligibility_overrides_created_by_idx
  on public.studio2_eligibility_overrides (created_by);

create index if not exists studio2_eligibility_overrides_revoked_by_idx
  on public.studio2_eligibility_overrides (revoked_by);

commit;
