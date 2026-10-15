begin;

-- System V3 S3: Entry invariants.
--
-- The V3 Entry cutover already created the append-only version/review ledger.
-- This migration completes the database boundary around it: repair only a
-- missing current pointer by appending evidence through the canonical trigger,
-- audit every existing chain and pointer, then enforce lineage, content and
-- exact-review scope on all future writes.

-- REPAIR: an owned Entry without a pointer has no ambiguous history to choose
-- between. A no-op content update makes the existing canonical trigger append
-- the current row as a fresh immutable version. Historical National Finals
-- without Confirmation ownership remain deliberately outside this ledger.
update public.internal_entries entry
set artist = entry.artist
where entry.current_version_id is null
  and exists (
    select 1 from public.submissions submission
    where submission.id = entry.submission_id
  );

update public.national_final_entries entry
set artist = entry.artist
where entry.current_version_id is null
  and exists (
    select 1
    from public.national_finals national_final
    join public.submissions submission
      on submission.id = national_final.submission_id
    where national_final.id = entry.national_final_id
  );

-- AUDIT: abort rather than guessing if an existing pointer or chain contains
-- semantic contradictions. Clean replay and upgrade rehearsal both exercise
-- this audit before any new enforcement is installed.
do $audit$
begin
  if exists (
    select 1
    from private.v3_entry_versions version
    left join private.v3_entry_versions parent
      on parent.id = version.parent_version_id
    where (version.revision = 1 and version.parent_version_id is not null)
       or (version.revision > 1 and (
         parent.id is null
         or parent.target_type is distinct from version.target_type
         or parent.entry_id is distinct from version.entry_id
         or parent.submission_id is distinct from version.submission_id
         or parent.edition_id is distinct from version.edition_id
         or parent.revision is distinct from version.revision - 1
       ))
       or version.content_hash is distinct from encode(
         extensions.digest(version.content::text, 'sha256'),
         'hex'
       )
  ) then
    raise exception 'Entry invariant audit failed: invalid immutable version chain';
  end if;

  if exists (
    select 1
    from public.internal_entries entry
    join public.submissions submission on submission.id = entry.submission_id
    left join private.v3_entry_versions version on version.id = entry.current_version_id
    where version.id is null
       or version.target_type <> 'internal'
       or version.entry_id <> entry.id
       or version.submission_id <> entry.submission_id
       or version.edition_id <> submission.edition_id
       or version.revision <> entry.content_revision
       or version.content_hash <> encode(
         extensions.digest(private.v3_entry_content(to_jsonb(entry))::text, 'sha256'),
         'hex'
       )
       or version.revision <> (
         select max(candidate.revision)
         from private.v3_entry_versions candidate
         where candidate.target_type = 'internal'
           and candidate.entry_id = entry.id
       )
  ) then
    raise exception 'Entry invariant audit failed: invalid internal Entry current pointer';
  end if;

  if exists (
    select 1
    from public.national_final_entries entry
    join public.national_finals national_final on national_final.id = entry.national_final_id
    join public.submissions submission on submission.id = national_final.submission_id
    left join private.v3_entry_versions version on version.id = entry.current_version_id
    where version.id is null
       or version.target_type <> 'national_final'
       or version.entry_id <> entry.id
       or version.submission_id <> submission.id
       or version.edition_id <> submission.edition_id
       or version.revision <> entry.content_revision
       or version.content_hash <> encode(
         extensions.digest(private.v3_entry_content(to_jsonb(entry))::text, 'sha256'),
         'hex'
       )
       or version.revision <> (
         select max(candidate.revision)
         from private.v3_entry_versions candidate
         where candidate.target_type = 'national_final'
           and candidate.entry_id = entry.id
       )
  ) then
    raise exception 'Entry invariant audit failed: invalid National Final Entry current pointer';
  end if;

  if exists (
    select 1
    from (
      select id, current_version_id, reviewed_version_id, 'internal'::text as target_type
      from public.internal_entries
      where reviewed_version_id is not null
      union all
      select id, current_version_id, reviewed_version_id, 'national_final'
      from public.national_final_entries
      where reviewed_version_id is not null
    ) entry
    left join private.v3_entry_versions version on version.id = entry.reviewed_version_id
    where entry.reviewed_version_id is distinct from entry.current_version_id
       or version.id is null
       or version.target_type is distinct from entry.target_type
       or version.entry_id is distinct from entry.id
       or not exists (
         select 1 from private.v3_entry_reviews review
         where review.version_id = entry.reviewed_version_id
       )
  ) then
    raise exception 'Entry invariant audit failed: review is not bound to the exact current version';
  end if;

  if exists (
    select 1
    from public.submission_review_history history
    join private.v3_entry_versions version on version.id = history.reviewed_version_id
    where version.target_type is distinct from history.target_type
       or version.entry_id is distinct from history.target_entry_id
       or version.submission_id is distinct from history.submission_id
  ) then
    raise exception 'Entry invariant audit failed: public review history has invalid version scope';
  end if;
end
$audit$;

create or replace function private.v3_guard_entry_version_lineage()
returns trigger
language plpgsql
set search_path = pg_catalog, private, extensions
as $guard$
declare
  v_parent private.v3_entry_versions;
begin
  if new.content_hash is distinct from encode(
    extensions.digest(new.content::text, 'sha256'),
    'hex'
  ) then
    raise exception 'Entry version content hash does not match immutable content'
      using errcode = '23514';
  end if;

  if new.revision = 1 then
    if new.parent_version_id is not null then
      raise exception 'Entry version 1 cannot have a parent' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_parent
  from private.v3_entry_versions parent
  where parent.id = new.parent_version_id;

  if v_parent.id is null
     or v_parent.target_type is distinct from new.target_type
     or v_parent.entry_id is distinct from new.entry_id
     or v_parent.submission_id is distinct from new.submission_id
     or v_parent.edition_id is distinct from new.edition_id
     or v_parent.revision is distinct from new.revision - 1 then
    raise exception 'Entry version parent must be the previous revision in the same scope'
      using errcode = '23514';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_entry_version_lineage()
  from public, anon, authenticated, service_role;

create trigger v3_s3_guard_entry_version_lineage
before insert on private.v3_entry_versions
for each row execute function private.v3_guard_entry_version_lineage();

create or replace function private.v3_validate_current_entry_pointer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $validate$
declare
  v_target_type text := case
    when tg_table_name = 'internal_entries' then 'internal'
    else 'national_final'
  end;
  v_submission_id uuid;
  v_edition_id uuid;
  v_version private.v3_entry_versions;
begin
  if v_target_type = 'internal' then
    select submission.id, submission.edition_id
    into v_submission_id, v_edition_id
    from public.submissions submission
    where submission.id = new.submission_id;
  else
    select submission.id, submission.edition_id
    into v_submission_id, v_edition_id
    from public.national_finals national_final
    join public.submissions submission on submission.id = national_final.submission_id
    where national_final.id = new.national_final_id;
  end if;

  if v_submission_id is null then
    if new.current_version_id is not null
       or new.content_revision is not null
       or new.reviewed_version_id is not null then
      raise exception 'Unowned historical Entry cannot carry canonical version pointers'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_version
  from private.v3_entry_versions version
  where version.id = new.current_version_id;

  if v_version.id is null
     or v_version.target_type is distinct from v_target_type
     or v_version.entry_id is distinct from new.id
     or v_version.submission_id is distinct from v_submission_id
     or v_version.edition_id is distinct from v_edition_id
     or v_version.revision is distinct from new.content_revision
     or v_version.content_hash is distinct from encode(
       extensions.digest(private.v3_entry_content(to_jsonb(new))::text, 'sha256'),
       'hex'
     )
     or exists (
       select 1
       from private.v3_entry_versions later
       where later.target_type = v_target_type
         and later.entry_id = new.id
         and later.revision > v_version.revision
     ) then
    raise exception 'Entry current pointer must reference its latest exact immutable content version'
      using errcode = '23514';
  end if;

  if new.reviewed_version_id is not null and (
    new.reviewed_version_id is distinct from new.current_version_id
    or not exists (
      select 1 from private.v3_entry_reviews review
      where review.version_id = new.reviewed_version_id
    )
  ) then
    raise exception 'Entry review must bind to the exact current immutable version'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_current_entry_pointer()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_internal_entry_pointer
after insert or update on public.internal_entries
deferrable initially immediate
for each row execute function private.v3_validate_current_entry_pointer();

create constraint trigger v3_s3_validate_nf_entry_pointer
after insert or update on public.national_final_entries
deferrable initially immediate
for each row execute function private.v3_validate_current_entry_pointer();

create or replace function private.v3_validate_review_history_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $validate$
begin
  if new.reviewed_version_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from private.v3_entry_versions version
    where version.id = new.reviewed_version_id
      and version.target_type = new.target_type
      and version.entry_id = new.target_entry_id
      and version.submission_id = new.submission_id
  ) then
    raise exception 'Review history version is outside its Entry scope'
      using errcode = '23514';
  end if;

  return new;
end
$validate$;

revoke all on function private.v3_validate_review_history_scope()
  from public, anon, authenticated, service_role;

create constraint trigger v3_s3_validate_review_history_scope
after insert or update on public.submission_review_history
deferrable initially immediate
for each row execute function private.v3_validate_review_history_scope();

commit;
