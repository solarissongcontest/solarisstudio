begin;

-- Compatibility hardening for the governed Jury correction authority.
-- Historical country ballots may not carry contest_entity_id even when the
-- modern UI can resolve one. Prefer voter row identity, then country identity,
-- then custom entity identity so legacy country-scoped writes and V3 previews
-- advance/read the same revision bucket.

alter table public.studio2_jury_ballot_revisions
  alter column version set default 0;

alter table public.studio2_jury_ballot_revisions
  drop constraint if exists studio2_jury_ballot_revisions_version_check;
alter table public.studio2_jury_ballot_revisions
  add constraint studio2_jury_ballot_revisions_version_check
  check (version >= 0) not valid;
alter table public.studio2_jury_ballot_revisions
  validate constraint studio2_jury_ballot_revisions_version_check;

create or replace function private.v3_jury_voter_scope_key(
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $body$
  select case
    when p_voter_id is not null then 'voter:' || p_voter_id::text
    when p_voter_country_id is not null then 'country:' || p_voter_country_id::text
    when p_voter_entity_id is not null then 'entity:' || p_voter_entity_id::text
    else null
  end
$body$;

-- Re-seed the canonical compatibility key after changing precedence. Old entity
-- buckets can remain as harmless history; all future reads/writes use the same
-- voter/country/entity precedence below.
insert into public.studio2_jury_ballot_revisions (
  edition_id, show_id, voter_scope_key, version
)
select distinct source.edition_id, source.show_id, source.voter_scope_key, 1
from (
  select
    vote.edition_id,
    vote.show_id,
    private.v3_jury_voter_scope_key(
      vote.voter_id,
      vote.voter_country_id,
      vote.voter_entity_id
    ) as voter_scope_key
  from public.jury_votes vote
  where vote.show_id is not null
  union
  select
    status.edition_id,
    status.show_id,
    private.v3_jury_voter_scope_key(
      status.voter_id,
      status.voter_country_id,
      status.voter_entity_id
    ) as voter_scope_key
  from public.jury_ballot_statuses status
  where status.show_id is not null
) source
where source.voter_scope_key is not null
on conflict (edition_id, show_id, voter_scope_key) do nothing;

create or replace function private.v3_jury_correction_identity_matches(
  p_row_voter_id uuid,
  p_row_country_id uuid,
  p_row_entity_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $body$
  select case
    when p_voter_id is not null then p_row_voter_id = p_voter_id
    when p_voter_country_id is not null then
      p_row_voter_id is null
      and (
        p_row_country_id = p_voter_country_id
        or (
          p_row_country_id is null
          and p_voter_entity_id is not null
          and p_row_entity_id = p_voter_entity_id
        )
      )
    when p_voter_entity_id is not null then
      p_row_voter_id is null and p_row_entity_id = p_voter_entity_id
    else false
  end
$body$;

-- Exactly one revision bump per affected aggregate for a same-scope UPDATE.
-- Scope moves bump both the old and new aggregates.
create or replace function private.v3_track_jury_vote_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_old_key text;
  v_new_key text;
begin
  if tg_op = 'INSERT' then
    perform private.v3_bump_jury_ballot_revision(
      new.edition_id, new.show_id,
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.v3_bump_jury_ballot_revision(
      old.edition_id, old.show_id,
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
    return old;
  end if;

  v_old_key := private.v3_jury_voter_scope_key(
    old.voter_id, old.voter_country_id, old.voter_entity_id
  );
  v_new_key := private.v3_jury_voter_scope_key(
    new.voter_id, new.voter_country_id, new.voter_entity_id
  );

  if new.edition_id is not distinct from old.edition_id
     and new.show_id is not distinct from old.show_id
     and v_new_key is not distinct from v_old_key then
    perform private.v3_bump_jury_ballot_revision(
      new.edition_id, new.show_id,
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
  else
    perform private.v3_bump_jury_ballot_revision(
      old.edition_id, old.show_id,
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
    perform private.v3_bump_jury_ballot_revision(
      new.edition_id, new.show_id,
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
  end if;

  return new;
end
$body$;

create or replace function private.v3_track_jury_dnv_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_old_key text;
  v_new_key text;
begin
  if tg_op = 'INSERT' then
    perform private.v3_bump_jury_ballot_revision(
      new.edition_id, new.show_id,
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.v3_bump_jury_ballot_revision(
      old.edition_id, old.show_id,
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
    return old;
  end if;

  v_old_key := private.v3_jury_voter_scope_key(
    old.voter_id, old.voter_country_id, old.voter_entity_id
  );
  v_new_key := private.v3_jury_voter_scope_key(
    new.voter_id, new.voter_country_id, new.voter_entity_id
  );

  if new.edition_id is not distinct from old.edition_id
     and new.show_id is not distinct from old.show_id
     and v_new_key is not distinct from v_old_key then
    perform private.v3_bump_jury_ballot_revision(
      new.edition_id, new.show_id,
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
  else
    perform private.v3_bump_jury_ballot_revision(
      old.edition_id, old.show_id,
      old.voter_id, old.voter_country_id, old.voter_entity_id
    );
    perform private.v3_bump_jury_ballot_revision(
      new.edition_id, new.show_id,
      new.voter_id, new.voter_country_id, new.voter_entity_id
    );
  end if;

  return new;
end
$body$;

revoke all on function private.v3_jury_voter_scope_key(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.v3_jury_correction_identity_matches(uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.v3_track_jury_vote_revision()
  from public, anon, authenticated, service_role;
revoke all on function private.v3_track_jury_dnv_revision()
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
