begin;

-- S16 show authority cutover at the database privilege layer.
--
-- API roles no longer receive whole-row write authority over public.shows.
-- Canonical definition/lifecycle create/update/delete operations execute through
-- SECURITY DEFINER commands. Temporary direct UPDATE compatibility is retained
-- only for neighbouring domains that still own their own columns and are being
-- migrated independently: design/broadcast presentation, voting configuration,
-- and lineup stage. Runtime/cue subtree guards still prevent those writers from
-- modifying showMode or studio2Rundown through broadcast_config.

revoke insert, update, delete, truncate on table public.shows
  from anon, authenticated, service_role;

-- Bounded compatibility columns. These are not live-show authority.
grant update (theme_id, broadcast_config, voting_config, qualifier_count, lineup_stage)
  on table public.shows to authenticated;

-- Read access remains governed by the existing SELECT grants and RLS policies.
-- No service-role DML grant is restored: trusted jobs/functions must use their
-- sanctioned SECURITY DEFINER operation boundary rather than raw table writes.

comment on table public.shows is
  'Canonical show table. Definition and lifecycle mutations are command-only. Direct authenticated UPDATE compatibility is limited to explicitly retained neighbouring-domain columns; showMode/studio2Rundown subtrees are independently guarded.';

commit;
