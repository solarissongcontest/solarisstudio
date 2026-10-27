begin;

select public.v3_register_migration_contract(
  'v3.media.immutable-publication-cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'Final media objects are immutable publication artifacts. Browser/delegation/Organizer DELETE policies on country media, country fonts, and edition artwork are removed so verified Storage bytes cannot diverge from the canonical media receipt. Consumer domains may unbind references; physical retirement requires an explicit governed media lifecycle operation.'
);

-- Canonical final objects are generated at unguessable/versioned paths by the
-- governed upload pipeline. Replacement creates another verified object and the
-- consuming domain changes its reference. Deleting the previous object directly
-- would leave studio2_upload_authorizations.status = verified while destroying
-- the bytes that receipt attests to.
drop policy if exists "country media bucket owner delete" on storage.objects;
drop policy if exists "country fonts owner delete" on storage.objects;
drop policy if exists "organizers delete edition artwork" on storage.objects;

-- Historical policy names are dropped as a defensive cutover. Some older
-- installations carried equivalent DELETE policies under these names.
drop policy if exists "country media owner delete" on storage.objects;
drop policy if exists "country font owner delete" on storage.objects;
drop policy if exists "edition artwork organizer delete" on storage.objects;

notify pgrst, 'reload schema';
commit;
