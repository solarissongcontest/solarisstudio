begin;

-- System V3 S3: Media invariants.
--
-- Canonical media bytes and URLs remain in their existing owners. Organizer
-- review rows are the immutable decision history for an exact source
-- fingerprint; this migration deliberately does not create a second asset or
-- upload store. It audits first, stages/validates declarative constraints, and
-- then makes an active decision follow the current canonical source.

-- REPAIR: there is no safe automatic repair for an approval whose scope or
-- source no longer matches canonical state. Production was audited with zero
-- review rows, so the migration fails closed if drift appears before rollout.
do $audit$
begin
  if exists (
    select 1
    from public.studio2_media_asset_reviews review
    where not (
      (
        review.asset_type = 'logo'
        and review.country_id is null
        and review.entry_id is null
        and review.asset_key = 'edition:' || review.edition_id::text || ':logo'
      )
      or (
        review.asset_type = 'flag'
        and review.country_id is not null
        and review.entry_id is null
        and review.asset_key = 'country:' || review.country_id::text || ':flag'
      )
      or (
        review.asset_type not in ('logo', 'flag')
        and review.country_id is not null
        and review.entry_id is not null
        and review.asset_key = 'entry:' || review.entry_id::text || ':' || review.asset_type
      )
    )
  ) then
    raise exception 'Media invariant audit failed: invalid asset scope';
  end if;

  if exists (
    select 1
    from public.studio2_media_asset_reviews review
    where review.reviewed_at > clock_timestamp()
       or (
         review.superseded_at is not null
         and review.superseded_at < review.reviewed_at
       )
  ) then
    raise exception 'Media invariant audit failed: invalid review timeline';
  end if;

  if exists (
    select 1
    from public.studio2_media_asset_reviews review
    where review.entry_id is not null
      and not exists (
        select 1
        from public.entries entry
        where entry.id = review.entry_id
          and entry.edition_id = review.edition_id
          and entry.country_id = review.country_id
      )
  ) then
    raise exception 'Media invariant audit failed: Entry media is outside its edition/country scope';
  end if;

  if exists (
    select 1
    from public.studio2_media_asset_reviews review
    where review.decision = 'approved'
      and btrim(review.source_fingerprint) !~* '^https?://'
  ) then
    raise exception 'Media invariant audit failed: approved source is not HTTP(S)';
  end if;

  if exists (
    select 1
    from public.studio2_media_asset_reviews review
    where review.superseded_at is null
      and review.source_fingerprint is distinct from private.studio2_resolve_media_asset_source(
        review.edition_id,
        review.asset_key,
        review.asset_type,
        review.country_id,
        review.entry_id
      )
  ) then
    raise exception 'Media invariant audit failed: active review does not reference the current source';
  end if;
end
$audit$;

alter table public.studio2_media_asset_reviews
  add constraint studio2_media_asset_reviews_scope_check
  check (
    (
      asset_type = 'logo'
      and country_id is null
      and entry_id is null
      and asset_key = 'edition:' || edition_id::text || ':logo'
    )
    or (
      asset_type = 'flag'
      and country_id is not null
      and entry_id is null
      and asset_key = 'country:' || country_id::text || ':flag'
    )
    or (
      asset_type not in ('logo', 'flag')
      and country_id is not null
      and entry_id is not null
      and asset_key = 'entry:' || entry_id::text || ':' || asset_type
    )
  ) not valid;

alter table public.studio2_media_asset_reviews
  add constraint studio2_media_asset_reviews_timeline_check
  check (superseded_at is null or superseded_at >= reviewed_at) not valid;

alter table public.studio2_media_asset_reviews
  add constraint studio2_media_asset_reviews_approved_source_check
  check (decision <> 'approved' or btrim(source_fingerprint) ~* '^https?://') not valid;

alter table public.studio2_media_asset_reviews
  validate constraint studio2_media_asset_reviews_scope_check;
alter table public.studio2_media_asset_reviews
  validate constraint studio2_media_asset_reviews_timeline_check;
alter table public.studio2_media_asset_reviews
  validate constraint studio2_media_asset_reviews_approved_source_check;

create or replace function private.v3_guard_media_asset_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_current_source text;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.edition_id is distinct from old.edition_id
       or new.asset_key is distinct from old.asset_key
       or new.asset_type is distinct from old.asset_type
       or new.country_id is distinct from old.country_id
       or new.entry_id is distinct from old.entry_id
       or new.source_fingerprint is distinct from old.source_fingerprint
       or new.decision is distinct from old.decision
       or new.reason is distinct from old.reason
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Media review history is immutable' using errcode = '23514';
    end if;

    if old.superseded_at is not null
       or new.superseded_at is null
       or new.superseded_at < old.reviewed_at then
      raise exception 'A media review may only transition once from active to superseded'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.superseded_at is not null then
    raise exception 'A new media review must begin as the active decision'
      using errcode = '23514';
  end if;

  if new.reviewed_at > clock_timestamp() then
    raise exception 'Media review timestamp cannot be in the future'
      using errcode = '23514';
  end if;

  if new.entry_id is not null and not exists (
    select 1
    from public.entries entry
    where entry.id = new.entry_id
      and entry.edition_id = new.edition_id
      and entry.country_id = new.country_id
  ) then
    raise exception 'Entry media review is outside its edition/country scope'
      using errcode = '23514';
  end if;

  v_current_source := private.studio2_resolve_media_asset_source(
    new.edition_id,
    new.asset_key,
    new.asset_type,
    new.country_id,
    new.entry_id
  );

  if v_current_source is null
     or btrim(v_current_source) is distinct from new.source_fingerprint then
    raise exception 'Media review must reference the exact current canonical source'
      using errcode = '23514';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_media_asset_review()
  from public, anon, authenticated, service_role;

create trigger v3_s3_guard_media_asset_review
before insert or update on public.studio2_media_asset_reviews
for each row execute function private.v3_guard_media_asset_review();

create or replace function private.v3_supersede_stale_media_reviews()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $supersede$
begin
  if tg_table_name = 'entries' then
    update public.studio2_media_asset_reviews review
    set superseded_at = clock_timestamp()
    where review.entry_id = new.id
      and review.superseded_at is null
      and review.source_fingerprint is distinct from private.studio2_resolve_media_asset_source(
        review.edition_id,
        review.asset_key,
        review.asset_type,
        review.country_id,
        review.entry_id
      );
  elsif tg_table_name = 'countries' then
    update public.studio2_media_asset_reviews review
    set superseded_at = clock_timestamp()
    where review.country_id = new.id
      and review.asset_type = 'flag'
      and review.superseded_at is null
      and review.source_fingerprint is distinct from nullif(btrim(new.flag_image), '');
  elsif tg_table_name = 'editions' then
    update public.studio2_media_asset_reviews review
    set superseded_at = clock_timestamp()
    where review.edition_id = new.id
      and review.asset_type = 'logo'
      and review.superseded_at is null
      and review.source_fingerprint is distinct from nullif(btrim(new.logo), '');
  end if;

  return new;
end
$supersede$;

revoke all on function private.v3_supersede_stale_media_reviews()
  from public, anon, authenticated, service_role;

create trigger v3_s3_supersede_entry_media_reviews
after update of song_url, metadata on public.entries
for each row execute function private.v3_supersede_stale_media_reviews();

create trigger v3_s3_supersede_country_flag_reviews
after update of flag_image on public.countries
for each row execute function private.v3_supersede_stale_media_reviews();

create trigger v3_s3_supersede_edition_logo_reviews
after update of logo on public.editions
for each row execute function private.v3_supersede_stale_media_reviews();

create or replace function private.v3_media_asset_is_currently_accepted(
  p_edition_id uuid,
  p_asset_key text,
  p_asset_type text,
  p_country_id uuid,
  p_entry_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $accepted$
  select exists (
    select 1
    from public.studio2_media_asset_reviews review
    where review.edition_id = p_edition_id
      and review.asset_key = p_asset_key
      and review.asset_type = p_asset_type
      and review.country_id is not distinct from p_country_id
      and review.entry_id is not distinct from p_entry_id
      and review.superseded_at is null
      and review.decision = 'approved'
      and review.source_fingerprint = private.studio2_resolve_media_asset_source(
        p_edition_id,
        p_asset_key,
        p_asset_type,
        p_country_id,
        p_entry_id
      )
  );
$accepted$;

revoke all on function private.v3_media_asset_is_currently_accepted(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
