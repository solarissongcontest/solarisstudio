begin;

-- Superseded compatibility marker.
--
-- The complete Organisation OS V5 governed permission-operation contract is
-- implemented by 20261003012000_organisation_os_v5_permission_operations.sql.
-- Keep this migration number stable so existing feature-branch migration
-- history does not need to be rewritten, but deliberately define no competing
-- functions or triggers here.

commit;
