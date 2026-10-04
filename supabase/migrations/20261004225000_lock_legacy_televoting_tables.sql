begin;

-- Legacy import/friend-voting staging tables are not part of the supported
-- participant runtime. They previously had RLS disabled while authenticated
-- users inherited table CRUD grants. Keep them available to service-role/admin
-- migration tooling, but remove them from the browser attack surface.

do $$
begin
  if to_regclass('televoting.legacy_friend_voting_relationships') is not null then
    execute 'alter table televoting.legacy_friend_voting_relationships enable row level security';
    execute 'revoke all on televoting.legacy_friend_voting_relationships from public, anon, authenticated';
  end if;

  if to_regclass('televoting.legacy_import_metadata') is not null then
    execute 'alter table televoting.legacy_import_metadata enable row level security';
    execute 'revoke all on televoting.legacy_import_metadata from public, anon, authenticated';
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
