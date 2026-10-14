begin;

-- A historical Confirmation restore already creates fresh Entry content versions
-- and deliberately invalidates any old review. Record *why* those versions were
-- created as immutable evidence too. The historical submission-version UUID is
-- retained without a foreign key so deleting the canonical response cannot erase
-- the provenance ledger.
alter table private.v3_entry_versions
  add column if not exists restored_from_submission_version_id uuid;

alter table private.v3_entry_versions
  drop constraint if exists v3_entry_versions_source_check;
alter table private.v3_entry_versions
  add constraint v3_entry_versions_source_check
  check (source in ('legacy_observation', 'canonical_write', 'organizer_restore'));

alter table private.v3_entry_versions
  drop constraint if exists v3_entry_versions_restore_provenance_check;
alter table private.v3_entry_versions
  add constraint v3_entry_versions_restore_provenance_check
  check (
    (source = 'organizer_restore' and restored_from_submission_version_id is not null)
    or
    (source <> 'organizer_restore' and restored_from_submission_version_id is null)
  );

create index if not exists v3_entry_versions_restore_source_idx
  on private.v3_entry_versions(restored_from_submission_version_id)
  where restored_from_submission_version_id is not null;

create or replace function private.v3_bind_confirmation_entry_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  submission_uuid uuid;
  edition_uuid uuid;
  target text := case when tg_table_name='internal_entries' then 'internal' else 'national_final' end;
  content_snapshot jsonb := private.v3_entry_content(to_jsonb(new));
  changed boolean;
  restore_version_uuid uuid;
  version_source text;
begin
  if tg_op='UPDATE' then
    if old.current_version_id is not null and (
      new.id is distinct from old.id
      or to_jsonb(new)->'submission_id' is distinct from to_jsonb(old)->'submission_id'
      or to_jsonb(new)->'national_final_id' is distinct from to_jsonb(old)->'national_final_id'
    ) then
      raise exception 'Versioned entries cannot change their Confirmation ownership' using errcode='22023';
    end if;
  end if;

  if target='internal' then
    submission_uuid:=new.submission_id;
  else
    select nf.submission_id into submission_uuid
    from public.national_finals nf
    where nf.id=(to_jsonb(new)->>'national_final_id')::uuid;
  end if;

  -- Historical national finals without Confirmation ownership keep their own workflow.
  if submission_uuid is null then
    new.current_version_id:=null;
    new.content_revision:=null;
    new.reviewed_version_id:=null;
    return new;
  end if;

  select s.edition_id into edition_uuid
  from public.submissions s
  where s.id=submission_uuid;

  restore_version_uuid := nullif(
    current_setting('solaris.v3_restore_submission_version_id', true),
    ''
  )::uuid;
  if restore_version_uuid is not null and not exists (
    select 1
    from public.submission_versions v
    where v.id=restore_version_uuid
      and v.submission_id=submission_uuid
  ) then
    raise exception 'Entry restore provenance does not belong to this Confirmation submission'
      using errcode='22023';
  end if;
  version_source := case
    when restore_version_uuid is not null then 'organizer_restore'
    else 'canonical_write'
  end;

  if tg_op='UPDATE' then
    new.current_version_id:=old.current_version_id;
    new.content_revision:=old.content_revision;
    new.reviewed_version_id:=old.reviewed_version_id;
    changed:=old.current_version_id is null
      or coalesce(current_setting('solaris.v3_force_entry_version',true)=submission_uuid::text,false)
      or content_snapshot is distinct from private.v3_entry_content(to_jsonb(old));
  else
    changed:=true;
    new.content_revision:=0;
    new.current_version_id:=null;
    new.reviewed_version_id:=null;
  end if;

  if changed then
    if target='national_final' and tg_op='UPDATE' and exists (
      select 1 from public.national_finals nf
      where nf.id=(to_jsonb(new)->>'national_final_id')::uuid
        and nf.winning_entry_id=new.id
    ) then
      raise exception 'Clear the National Final winner before editing its reviewed content' using errcode='22023';
    end if;

    new.content_revision:=coalesce(new.content_revision,0)+1;
    if tg_op='INSERT' then
      -- ON CONFLICT can discard an INSERT candidate after BEFORE triggers.
      -- Record its evidence only in AFTER INSERT, once a row really exists.
      new.current_version_id:=gen_random_uuid();
    else
      insert into private.v3_entry_versions(
        target_type, entry_id, submission_id, edition_id,
        revision, parent_version_id, source,
        restored_from_submission_version_id,
        content, content_hash, actor_id
      )
      values(
        target,new.id,submission_uuid,edition_uuid,
        new.content_revision,new.current_version_id,version_source,
        restore_version_uuid,
        content_snapshot,
        encode(extensions.digest(content_snapshot::text,'sha256'),'hex'),
        auth.uid()
      )
      returning id into new.current_version_id;
    end if;

    new.reviewed_version_id:=null;
    if tg_op='UPDATE' then
      if new.review_status <> 'removed' then new.review_status:='pending'; end if;
      new.review_reason:=null;
      new.reviewed_at:=null;
      new.reviewed_by:=null;
    end if;
  elsif new.review_status='pending' then
    new.reviewed_version_id:=null;
  elsif new.reviewed_at is not null and (
    new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.review_status is distinct from old.review_status
    or new.review_reason is distinct from old.review_reason
  ) then
    new.reviewed_version_id:=new.current_version_id;
    insert into private.v3_entry_reviews(version_id,decision,reason,reviewed_at,actor_id)
    values(new.current_version_id,new.review_status,new.review_reason,new.reviewed_at,new.reviewed_by);
  end if;
  return new;
end;
$$;
revoke all on function private.v3_bind_confirmation_entry_version() from public, anon, authenticated;

create or replace function private.v3_record_inserted_entry_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  submission_uuid uuid;
  edition_uuid uuid;
  content_snapshot jsonb;
  restore_version_uuid uuid;
  version_source text;
begin
  if new.current_version_id is null then return new; end if;

  if tg_table_name='internal_entries' then
    submission_uuid:=new.submission_id;
  else
    select nf.submission_id into submission_uuid
    from public.national_finals nf
    where nf.id=(to_jsonb(new)->>'national_final_id')::uuid;
  end if;
  select s.edition_id into edition_uuid
  from public.submissions s
  where s.id=submission_uuid;

  restore_version_uuid := nullif(
    current_setting('solaris.v3_restore_submission_version_id', true),
    ''
  )::uuid;
  if restore_version_uuid is not null and not exists (
    select 1
    from public.submission_versions v
    where v.id=restore_version_uuid
      and v.submission_id=submission_uuid
  ) then
    raise exception 'Entry restore provenance does not belong to this Confirmation submission'
      using errcode='22023';
  end if;
  version_source := case
    when restore_version_uuid is not null then 'organizer_restore'
    else 'canonical_write'
  end;

  content_snapshot:=private.v3_entry_content(to_jsonb(new));
  insert into private.v3_entry_versions(
    id,target_type,entry_id,submission_id,edition_id,revision,source,
    restored_from_submission_version_id,content,content_hash,actor_id
  )
  values(
    new.current_version_id,
    case when tg_table_name='internal_entries' then 'internal' else 'national_final' end,
    new.id,submission_uuid,edition_uuid,1,version_source,
    restore_version_uuid,content_snapshot,
    encode(extensions.digest(content_snapshot::text,'sha256'),'hex'),auth.uid()
  );
  return new;
end;
$$;
revoke all on function private.v3_record_inserted_entry_version() from public,anon,authenticated;

create or replace function public.v3_confirmation_entry_versions(
  p_target_type text,
  p_entry_id uuid,
  p_before_revision bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  context jsonb;
  allowed boolean;
  versions jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  context:=private.studio2_confirmation_review_context(p_target_type,p_entry_id);
  allowed:=public.studio2_access_allowed(
    'confirmation.manage',
    (context->>'editionId')::uuid,
    false
  );
  if not allowed then
    select exists(
      select 1
      from jsonb_array_elements(public.public_country_account_confirmation_access()->'responses') response
      where response->>'submission_id'=context->>'submissionId'
    ) into allowed;
  end if;
  if not coalesce(allowed,false) then
    raise exception 'Entry history access denied' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,
    'revision',v.revision,
    'parent_version_id',v.parent_version_id,
    'source',v.source,
    'restored_from_submission_version_id',v.restored_from_submission_version_id,
    'content',v.content,
    'content_hash',v.content_hash,
    'recorded_at',v.recorded_at,
    'reviews',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'decision',r.decision,
        'reason',r.reason,
        'reviewed_at',r.reviewed_at
      ) order by r.reviewed_at,r.id),'[]'::jsonb)
      from private.v3_entry_reviews r
      where r.version_id=v.id
    )
  ) order by v.revision desc),'[]'::jsonb)
  into versions
  from (
    select *
    from private.v3_entry_versions
    where target_type=context->>'targetType'
      and entry_id=p_entry_id
      and submission_id=(context->>'submissionId')::uuid
      and (p_before_revision is null or revision<p_before_revision)
    order by revision desc
    limit 20
  ) v;

  return jsonb_build_object(
    'entry_id',p_entry_id,
    'submission_id',context->>'submissionId',
    'versions',versions
  );
end;
$$;
revoke all on function public.v3_confirmation_entry_versions(text,uuid,bigint) from public,anon;
grant execute on function public.v3_confirmation_entry_versions(text,uuid,bigint) to authenticated,service_role;

-- Keep the existing authority, lock order and moderation-removal check. The only
-- new responsibility of this wrapper is to establish a transaction-local,
-- server-owned provenance marker immediately around the already-guarded restore.
create or replace function public.admin_restore_confirmation_version(
  _submission_id uuid,
  _version_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_round_id uuid;
  native_admin boolean := false;
  solaris_admin boolean := false;
  previous_restore_version text;
  restore_result jsonb;
begin
  native_admin := private.solaris_confirmation_admin_allowed();
  if not native_admin then
    solaris_admin := private.solaris_confirmation_admin_allowed();
  end if;
  if not (native_admin or solaris_admin) then
    raise exception 'Forbidden';
  end if;

  if nullif(btrim(coalesce(_reason, '')), '') is null then
    raise exception 'Restore reason is required';
  end if;

  select s.round_id
  into target_round_id
  from public.submissions s
  where s.id = _submission_id;
  if target_round_id is null then
    raise exception 'Submission not found';
  end if;

  -- Match submit_confirmation(): round first, then submission inside the helper.
  perform 1
  from public.submission_rounds r
  where r.id = target_round_id
  for update;

  if exists (
    select 1
    from public.submission_versions v
    join public.national_finals nf
      on nf.submission_id = _submission_id
    join public.national_final_entries removed_entry
      on removed_entry.national_final_id = nf.id
     and coalesce(removed_entry.removed, false) = true
    where v.id = _version_id
      and v.submission_id = _submission_id
      and exists (
        select 1
        from jsonb_array_elements(
          case
            when jsonb_typeof(v.snapshot -> 'nf_entries') = 'array'
              then v.snapshot -> 'nf_entries'
            else '[]'::jsonb
          end
        ) historical_entry
        where coalesce((historical_entry ->> 'removed')::boolean, false) = false
          and private.v3_normalize_confirmation_entry_text(historical_entry ->> 'artist')
              = private.v3_normalize_confirmation_entry_text(removed_entry.artist)
          and private.v3_normalize_confirmation_entry_text(historical_entry ->> 'song_title')
              = private.v3_normalize_confirmation_entry_text(removed_entry.song_title)
      )
  ) then
    raise exception 'Restore blocked: the historical snapshot contains a National Final entry removed by organizer moderation';
  end if;

  previous_restore_version := current_setting(
    'solaris.v3_restore_submission_version_id',
    true
  );
  perform set_config(
    'solaris.v3_restore_submission_version_id',
    _version_id::text,
    true
  );

  begin
    restore_result := public.admin_restore_confirmation_version_apply(
      _submission_id,
      _version_id,
      _reason
    );
  exception when others then
    perform set_config(
      'solaris.v3_restore_submission_version_id',
      coalesce(previous_restore_version,''),
      true
    );
    raise;
  end;

  perform set_config(
    'solaris.v3_restore_submission_version_id',
    coalesce(previous_restore_version,''),
    true
  );
  return restore_result;
end;
$$;

revoke all on function public.admin_restore_confirmation_version(uuid, uuid, text)
  from public;
grant execute on function public.admin_restore_confirmation_version(uuid, uuid, text)
  to authenticated, service_role;

commit;
