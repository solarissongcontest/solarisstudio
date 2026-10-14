begin;

-- Canonical Confirmation entries remain the only mutable entry/review authority.
-- Historical observations are not retroactive proof of a reviewed submission.
create table private.v3_entry_versions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('internal', 'national_final')),
  entry_id uuid not null,
  submission_id uuid not null,
  edition_id uuid not null,
  revision bigint not null check (revision > 0),
  parent_version_id uuid references private.v3_entry_versions(id),
  source text not null check (source in ('legacy_observation', 'canonical_write')),
  content jsonb not null,
  content_hash text not null,
  recorded_at timestamptz not null default now(),
  actor_id uuid,
  unique (target_type, entry_id, revision)
);
create table private.v3_entry_reviews (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references private.v3_entry_versions(id),
  decision text not null check (decision in ('accepted', 'declined', 'removed')),
  reason text,
  reviewed_at timestamptz not null,
  actor_id uuid
);
create index v3_entry_reviews_version_idx on private.v3_entry_reviews(version_id, reviewed_at, id);
revoke all on private.v3_entry_versions, private.v3_entry_reviews from public, anon, authenticated, service_role;

alter table public.internal_entries
  add column content_revision bigint,
  add column current_version_id uuid,
  add column reviewed_version_id uuid;
alter table public.national_final_entries
  add column content_revision bigint,
  add column current_version_id uuid,
  add column reviewed_version_id uuid;
alter table public.submission_review_history add column reviewed_version_id uuid;

create function private.v3_entry_content(row_data jsonb)
returns jsonb language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object(
    'artist', row_data->'artist', 'song_title', row_data->'song_title',
    'song_url', row_data->'song_url', 'preview_start', row_data->'preview_start',
    'preview_end', row_data->'preview_end', 'final_clip_start', row_data->'final_clip_start',
    'final_clip_end', row_data->'final_clip_end',
    'replacement_video_required', row_data->'replacement_video_required',
    'replacement_video_url', row_data->'replacement_video_url'
  );
$$;
revoke all on function private.v3_entry_content(jsonb) from public, anon, authenticated;

-- No cascading foreign keys: deleting a canonical response must not rewrite
-- already recorded evidence. Reads still require a currently authorized response.
with observed as (
  insert into private.v3_entry_versions(target_type, entry_id, submission_id, edition_id, revision, source, content, content_hash)
  select 'internal', i.id, s.id, s.edition_id, 1, 'legacy_observation',
    private.v3_entry_content(to_jsonb(i)),
    encode(extensions.digest(private.v3_entry_content(to_jsonb(i))::text, 'sha256'), 'hex')
  from public.internal_entries i join public.submissions s on s.id=i.submission_id
  returning id, entry_id
)
update public.internal_entries i set current_version_id=o.id, content_revision=1 from observed o where i.id=o.entry_id;
with observed as (
  insert into private.v3_entry_versions(target_type, entry_id, submission_id, edition_id, revision, source, content, content_hash)
  select 'national_final', i.id, s.id, s.edition_id, 1, 'legacy_observation',
    private.v3_entry_content(to_jsonb(i)),
    encode(extensions.digest(private.v3_entry_content(to_jsonb(i))::text, 'sha256'), 'hex')
  from public.national_final_entries i join public.national_finals nf on nf.id=i.national_final_id
  join public.submissions s on s.id=nf.submission_id
  returning id, entry_id
)
update public.national_final_entries i set current_version_id=o.id, content_revision=1 from observed o where i.id=o.entry_id;

create function private.v3_guard_immutable_entry_evidence()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Entry version and review evidence is append-only' using errcode='42501';
end;
$$;
revoke all on function private.v3_guard_immutable_entry_evidence() from public, anon, authenticated;
create trigger v3_entry_versions_immutable before update or delete on private.v3_entry_versions
for each row execute function private.v3_guard_immutable_entry_evidence();
create trigger v3_entry_reviews_immutable before update or delete on private.v3_entry_reviews
for each row execute function private.v3_guard_immutable_entry_evidence();

create function private.v3_bind_confirmation_entry_version()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare
  submission_uuid uuid;
  edition_uuid uuid;
  target text := case when tg_table_name='internal_entries' then 'internal' else 'national_final' end;
  content_snapshot jsonb := private.v3_entry_content(to_jsonb(new));
  changed boolean;
begin
  if target='internal' then submission_uuid:=new.submission_id;
  else select nf.submission_id into submission_uuid from public.national_finals nf where nf.id=new.national_final_id;
  end if;
  -- Historical national finals without Confirmation ownership keep their own workflow.
  if submission_uuid is null then
    new.current_version_id:=null; new.content_revision:=null; new.reviewed_version_id:=null;
    return new;
  end if;
  select s.edition_id into edition_uuid from public.submissions s where s.id=submission_uuid;
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or (target='internal' and to_jsonb(new)->'submission_id' is distinct from to_jsonb(old)->'submission_id')
       or (target='national_final' and to_jsonb(new)->'national_final_id' is distinct from to_jsonb(old)->'national_final_id') then
      raise exception 'Versioned entries cannot change their Confirmation ownership' using errcode='22023';
    end if;
    new.current_version_id:=old.current_version_id;
    new.content_revision:=old.content_revision;
    new.reviewed_version_id:=old.reviewed_version_id;
    changed:=content_snapshot is distinct from private.v3_entry_content(to_jsonb(old));
  else
    changed:=true; new.content_revision:=0; new.current_version_id:=null; new.reviewed_version_id:=null;
  end if;
  if changed then
    if target='national_final' and tg_op='UPDATE' and exists (
      select 1 from public.national_finals nf where nf.id=new.national_final_id and nf.winning_entry_id=new.id
    ) then
      raise exception 'Clear the National Final winner before editing its reviewed content' using errcode='22023';
    end if;
    new.content_revision:=coalesce(new.content_revision,0)+1;
    insert into private.v3_entry_versions(target_type, entry_id, submission_id, edition_id,
      revision, parent_version_id, source, content, content_hash, actor_id)
    values(target,new.id,submission_uuid,edition_uuid,new.content_revision,new.current_version_id,
      'canonical_write',content_snapshot,encode(extensions.digest(content_snapshot::text,'sha256'),'hex'),auth.uid())
    returning id into new.current_version_id;
    new.reviewed_version_id:=null;
    -- Inserting a trusted legacy/historical status is not an exact-version review.
    if tg_op='UPDATE' then
      if new.review_status <> 'removed' then new.review_status:='pending'; end if;
      new.review_reason:=null; new.reviewed_at:=null; new.reviewed_by:=null;
    end if;
  elsif new.review_status='pending' then
    new.reviewed_version_id:=null;
  elsif new.reviewed_at is not null and (
    new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by is distinct from old.reviewed_by
    or new.review_status is distinct from old.review_status or new.review_reason is distinct from old.review_reason
  ) then
    new.reviewed_version_id:=new.current_version_id;
    insert into private.v3_entry_reviews(version_id,decision,reason,reviewed_at,actor_id)
    values(new.current_version_id,new.review_status,new.review_reason,new.reviewed_at,new.reviewed_by);
  end if;
  return new;
end;
$$;
revoke all on function private.v3_bind_confirmation_entry_version() from public, anon, authenticated;
create trigger v3_bind_internal_entry before insert or update on public.internal_entries
for each row execute function private.v3_bind_confirmation_entry_version();
create trigger v3_bind_nf_entry before insert or update on public.national_final_entries
for each row execute function private.v3_bind_confirmation_entry_version();

create function private.v3_guard_exact_reviewed_winner()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare candidate public.national_final_entries;
begin
  if new.submission_id is null or new.winning_entry_id is null then return new; end if;
  if tg_op='UPDATE' and new.winning_entry_id is not distinct from old.winning_entry_id then return new; end if;
  select * into candidate from public.national_final_entries where id=new.winning_entry_id for update;
  if candidate.national_final_id is distinct from new.id or candidate.review_status is distinct from 'accepted'
    or coalesce(candidate.removed,false) or candidate.current_version_id is null
    or candidate.reviewed_version_id is distinct from candidate.current_version_id then
    raise exception 'Review the exact current National Final entry version before selecting it as winner' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.v3_guard_exact_reviewed_winner() from public, anon, authenticated;
create trigger v3_guard_exact_reviewed_winner before insert or update of winning_entry_id on public.national_finals
for each row execute function private.v3_guard_exact_reviewed_winner();

create function private.v3_bind_review_history_version()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  new.reviewed_version_id:=null;
  if new.target_type='internal' then
    select i.reviewed_version_id into new.reviewed_version_id from public.internal_entries i where i.id=new.target_entry_id;
  elsif new.target_type='national_final' then
    select i.reviewed_version_id into new.reviewed_version_id from public.national_final_entries i where i.id=new.target_entry_id;
  end if;
  return new;
end;
$$;
revoke all on function private.v3_bind_review_history_version() from public, anon, authenticated;
create trigger v3_bind_review_history before insert on public.submission_review_history
for each row execute function private.v3_bind_review_history_version();

create function public.v3_confirmation_entry_versions(p_target_type text, p_entry_id uuid, p_before_revision bigint default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, private as $$
declare context jsonb; allowed boolean; versions jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  context:=private.studio2_confirmation_review_context(p_target_type,p_entry_id);
  allowed:=public.studio2_access_allowed('confirmation.manage',(context->>'editionId')::uuid,false);
  if not allowed then
    select exists(select 1 from jsonb_array_elements(public.public_country_account_confirmation_access()->'responses') response
      where response->>'submission_id'=context->>'submissionId') into allowed;
  end if;
  if not coalesce(allowed,false) then raise exception 'Entry history access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',v.id,'revision',v.revision,'parent_version_id',v.parent_version_id,'source',v.source,
    'content',v.content,'content_hash',v.content_hash,'recorded_at',v.recorded_at,
    'reviews',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'decision',r.decision,'reason',r.reason,'reviewed_at',r.reviewed_at)
      order by r.reviewed_at,r.id),'[]'::jsonb) from private.v3_entry_reviews r where r.version_id=v.id)
  ) order by v.revision desc),'[]'::jsonb) into versions
  from (select * from private.v3_entry_versions where target_type=context->>'targetType' and entry_id=p_entry_id
    and submission_id=(context->>'submissionId')::uuid and (p_before_revision is null or revision<p_before_revision)
    order by revision desc limit 20) v;
  return jsonb_build_object('entry_id',p_entry_id,'submission_id',context->>'submissionId','versions',versions);
end;
$$;
revoke all on function public.v3_confirmation_entry_versions(text,uuid,bigint) from public,anon;
grant execute on function public.v3_confirmation_entry_versions(text,uuid,bigint) to authenticated,service_role;

create or replace function private.studio2_confirmation_review_context(
  p_target_type text,
  p_entry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $context$
declare
  v_target text := lower(btrim(coalesce(p_target_type, '')));
  v_result jsonb;
begin
  if v_target = 'internal' then
    select jsonb_build_object(
      'targetType', 'internal',
      'entryId', entry.id,
      'submissionId', submission.id,
      'editionId', submission.edition_id,
      'currentStatus', entry.review_status,
      'currentVersionId', entry.current_version_id,
      'reviewedVersionId', entry.reviewed_version_id,
      'contentRevision', entry.content_revision,
      'artist', entry.artist,
      'songTitle', entry.song_title,
      'isWinner', false
    )
    into v_result
    from public.internal_entries entry
    join public.submissions submission on submission.id = entry.submission_id
    where entry.id = p_entry_id;
  elsif v_target = 'national_final' then
    select jsonb_build_object(
      'targetType', 'national_final',
      'entryId', entry.id,
      'submissionId', submission.id,
      'editionId', submission.edition_id,
      'nationalFinalId', nf.id,
      'currentStatus', entry.review_status,
      'currentVersionId', entry.current_version_id,
      'reviewedVersionId', entry.reviewed_version_id,
      'contentRevision', entry.content_revision,
      'artist', entry.artist,
      'songTitle', entry.song_title,
      'isWinner', nf.winning_entry_id = entry.id
    )
    into v_result
    from public.national_final_entries entry
    join public.national_finals nf on nf.id = entry.national_final_id
    join public.submissions submission on submission.id = nf.submission_id
    where entry.id = p_entry_id;
  else
    raise exception 'Unknown confirmation review target type'
      using errcode = '22023';
  end if;

  if v_result is null then
    raise exception 'Confirmation review entry not found' using errcode = 'P0002';
  end if;

  return v_result;
end
$context$;

revoke all on function private.studio2_confirmation_review_context(text, uuid)
  from public, anon, authenticated;


create or replace function public.studio2_apply_confirmation_entry_review(
  p_target_type text,
  p_entry_id uuid,
  p_target_status text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_context jsonb;
  v_target_type text := lower(btrim(coalesce(p_target_type, '')));
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_submission_id uuid;
  v_edition_id uuid;
  v_current_version bigint;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
begin
  v_context := private.studio2_confirmation_review_context(
    v_target_type,
    p_entry_id
  );
  v_submission_id := (v_context ->> 'submissionId')::uuid;
  v_edition_id := (v_context ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('confirmation.manage', v_edition_id, false) then
    raise exception 'Missing Solaris capability: confirmation.manage'
      using errcode = '42501';
  end if;

  -- Lock the entry before the submission CAS row, matching content-writer order.
  if v_target_type = 'internal' then
    perform 1 from public.internal_entries where id=p_entry_id for update;
  else
    perform 1 from public.national_final_entries where id=p_entry_id for update;
  end if;
  v_context := private.studio2_confirmation_review_context(v_target_type, p_entry_id);

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id
  for update;

  if coalesce(v_current_version, 1) is distinct from p_expected_version then
    raise exception 'Selection review changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  -- Re-run all target-state and winner invariants at mutation time.
  perform public.studio2_confirmation_entry_review_preview(
    v_target_type,
    p_entry_id,
    v_target_status
  );

  if v_target_status <> 'accepted' and v_reason is null then
    raise exception 'An organiser reason is required for this review transition'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'confirmation.entry.review',
    'R2',
    jsonb_build_object(
      'submissionId', v_submission_id,
      'entryId', p_entry_id,
      'targetType', v_target_type,
      'targetStatus', v_target_status,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  if v_target_type = 'internal' then
    update public.internal_entries
    set
      review_status = v_target_status,
      review_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_entry_id;
  else
    update public.national_final_entries
    set
      review_status = v_target_status,
      review_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      removed = v_target_status = 'removed',
      removed_at = case when v_target_status = 'removed' then now() else null end
    where id = p_entry_id;
  end if;

  insert into public.submission_review_history (
    submission_id,
    target_type,
    target_entry_id,
    artist_snapshot,
    song_title_snapshot,
    action,
    reason,
    admin_user_id
  )
  values (
    v_submission_id,
    v_target_type,
    p_entry_id,
    v_context ->> 'artist',
    v_context ->> 'songTitle',
    v_target_status,
    coalesce(v_reason, 'Accepted by organiser'),
    auth.uid()
  );

  select version
  into v_current_version
  from public.studio2_confirmation_review_versions
  where submission_id = v_submission_id;

  v_result := jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'entryId', p_entry_id,
    'targetType', v_target_type,
    'status', v_target_status,
    'version', v_current_version,
    'operationId', v_operation_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_confirmation_entry_review(
  text, uuid, text, text, uuid, text, bigint
) to authenticated, service_role;


create or replace function public.public_country_account_confirmation_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  caller_user_id uuid := auth.uid();
  account_country_id uuid;
  country_row public.countries;
  responses jsonb;
begin
  if caller_user_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select ca.country_id
  into account_country_id
  from public.country_accounts ca
  where ca.user_id = caller_user_id
    and ca.status = 'active'
  limit 1;

  if account_country_id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select c.*
  into country_row
  from public.countries c
  where c.id = account_country_id;

  if country_row.id is null then
    return jsonb_build_object(
      'authenticated', false,
      'country', null,
      'responses', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'submission_id', s.id,
        'round_id', r.id,
        'round_name', r.name,
        'edition_id', e.id,
        'edition_name', e.name,
        'edition_number', e.edition_number,
        'country', s.country,
        'participating', s.participating,
        'submitted_at', s.submitted_at,
        'updated_at', s.updated_at,
        'selection_method', s.selection_method,
        'entry_unknown', s.entry_unknown,
        'reveal_date_type', s.reveal_date_type,
        'reveal_exact_date', s.reveal_exact_date,
        'reveal_approximate_text', s.reveal_approximate_text,
        'nf_date_type', s.nf_date_type,
        'nf_exact_date', s.nf_exact_date,
        'nf_result_date_type', s.nf_result_date_type,
        'nf_result_exact_date', s.nf_result_exact_date,
        'internal_entry', (
          select jsonb_build_object(
            'id', i.id,
            'artist', i.artist,
            'song_title', i.song_title,
            'review_status', coalesce(i.review_status, 'pending'),
            'review_reason', i.review_reason,
            'content_revision', i.content_revision,
            'current_version_id', i.current_version_id,
            'reviewed_version_id', i.reviewed_version_id,
            'reviewed_at', i.reviewed_at
          )
          from public.internal_entries i
          where i.submission_id = s.id
          limit 1
        ),
        'national_final', (
          select jsonb_build_object(
            'id', nf.id,
            'nf_name', nf.nf_name,
            'winning_entry_id', nf.winning_entry_id,
            'entries', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', nfe.id,
                  'artist', nfe.artist,
                  'song_title', nfe.song_title,
                  'position', nfe.position,
                  'review_status', coalesce(nfe.review_status, 'pending'),
                  'review_reason', nfe.review_reason,
                  'content_revision', nfe.content_revision,
            'current_version_id', nfe.current_version_id,
            'reviewed_version_id', nfe.reviewed_version_id,
            'reviewed_at', nfe.reviewed_at,
                  'removed', coalesce(nfe.removed, false)
                )
                order by nfe.position, nfe.id
              )
              from public.national_final_entries nfe
              where nfe.national_final_id = nf.id
            ), '[]'::jsonb)
          )
          from public.national_finals nf
          where nf.submission_id = s.id
          limit 1
        ),
        'can_edit',
          not coalesce(s.locked, false)
          and coalesce(s.editing_allowed, false)
          and coalesce(r.editing_enabled, false)
          and coalesce(e.editing_enabled, false),
        'reason',
          case
            when coalesce(s.locked, false) then 'locked'
            when not coalesce(s.editing_allowed, false)
              or not coalesce(r.editing_enabled, false)
              or not coalesce(e.editing_enabled, false) then 'editing_closed'
            else 'open'
          end
      )
      order by e.edition_number desc, s.submitted_at desc
    ),
    '[]'::jsonb
  )
  into responses
  from public.submissions s
  join public.submission_rounds r on r.id = s.round_id
  join public.editions e on e.id = r.edition_id
  where lower(trim(s.country)) in (
    lower(trim(country_row.name)),
    lower(trim(country_row.short_code))
  );

  return jsonb_build_object(
    'authenticated', true,
    'country', jsonb_build_object(
      'country_id', country_row.id,
      'name', country_row.name,
      'short_code', country_row.short_code
    ),
    'responses', responses
  );
end;
$$;

revoke all on function public.public_country_account_confirmation_access() from public;
revoke execute on function public.public_country_account_confirmation_access() from anon;
grant execute on function public.public_country_account_confirmation_access() to authenticated, service_role;


create or replace function public.admin_confirmation_response(_submission_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result jsonb;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'country', s.country,
    'instagram_username', s.instagram_username,
    'country_account', s.country_account,
    'has_country_account', s.has_country_account,
    'participating', s.participating,
    'selection_method', s.selection_method,
    'entry_unknown', s.entry_unknown,
    'nf_entries_unknown', s.nf_entries_unknown,
    'reveal_date_type', s.reveal_date_type,
    'reveal_exact_date', s.reveal_exact_date,
    'reveal_approximate_text', s.reveal_approximate_text,
    'nf_date_type', s.nf_date_type,
    'nf_exact_date', s.nf_exact_date,
    'nf_approximate_text', s.nf_approximate_text,
    'nf_result_date_type', s.nf_result_date_type,
    'nf_result_exact_date', s.nf_result_exact_date,
    'nf_result_approximate_text', s.nf_result_approximate_text,
    'editing_allowed', s.editing_allowed,
    'locked', s.locked,
    'reviewed', s.reviewed,
    'admin_notes', s.admin_notes,
    'edit_count', s.edit_count,
    'submitted_at', s.submitted_at,
    'updated_at', s.updated_at,
    'round', jsonb_build_object('id', r.id, 'name', r.name),
    'edition', jsonb_build_object('id', e.id, 'name', e.name, 'edition_number', e.edition_number),
    'internal_entry', (
      select jsonb_build_object(
        'id', i.id, 'artist', i.artist, 'song_title', i.song_title, 'song_url', i.song_url,
        'review_status', i.review_status, 'review_reason', i.review_reason, 'reviewed_at', i.reviewed_at,
        'content_revision', i.content_revision, 'current_version_id', i.current_version_id,
        'reviewed_version_id', i.reviewed_version_id,
        'preview_start', i.preview_start, 'preview_end', i.preview_end,
        'final_clip_start', i.final_clip_start, 'final_clip_end', i.final_clip_end,
        'replacement_video_required', i.replacement_video_required,
        'replacement_video_url', i.replacement_video_url
      ) from public.internal_entries i where i.submission_id=s.id limit 1
    ),
    'national_final', (
      select jsonb_build_object(
        'id', nf.id, 'nf_name', nf.nf_name, 'expected_entry_count', nf.expected_entry_count,
        'winning_entry_id', nf.winning_entry_id,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', nfe.id, 'artist', nfe.artist, 'song_title', nfe.song_title, 'song_url', nfe.song_url,
            'review_status', nfe.review_status, 'review_reason', nfe.review_reason, 'reviewed_at', nfe.reviewed_at,
        'content_revision', nfe.content_revision, 'current_version_id', nfe.current_version_id,
        'reviewed_version_id', nfe.reviewed_version_id,
            'removed', nfe.removed, 'position', nfe.position,
            'preview_start', nfe.preview_start, 'preview_end', nfe.preview_end,
            'final_clip_start', nfe.final_clip_start, 'final_clip_end', nfe.final_clip_end,
            'replacement_video_required', nfe.replacement_video_required,
            'replacement_video_url', nfe.replacement_video_url
          ) order by nfe.position)
          from public.national_final_entries nfe where nfe.national_final_id=nf.id
        ), '[]'::jsonb)
      ) from public.national_finals nf where nf.submission_id=s.id limit 1
    ),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'target_type', h.target_type,
        'target_entry_id', h.target_entry_id,
        'reviewed_version_id', h.reviewed_version_id,
        'artist', h.artist_snapshot,
        'song_title', h.song_title_snapshot,
        'action', h.action,
        'reason', h.reason,
        'created_at', h.created_at
      ) order by h.created_at desc)
      from public.submission_review_history h where h.submission_id=s.id
    ), '[]'::jsonb)
  )
  into result
  from public.submissions s
  join public.submission_rounds r on r.id=s.round_id
  join public.editions e on e.id=s.edition_id
  where s.id=_submission_id;

  if result is null then raise exception 'Submission not found' using errcode='22023'; end if;
  return result;
end;
$$;


commit;
