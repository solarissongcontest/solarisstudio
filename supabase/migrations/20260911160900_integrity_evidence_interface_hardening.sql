begin;

-- Do not leak evidence storage object paths through the organizer case snapshot.
-- The case desk needs lifecycle metadata, not the private bucket locator.
create or replace function public.admin_integrity_case(_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  return (select jsonb_build_object(
    'case', to_jsonb(c) - 'reporter_user_id',
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at, m.id) from public.integrity_case_messages m where m.case_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at, n.id) from public.integrity_case_internal_notes n where n.case_id = c.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id) from public.integrity_case_events e where e.case_id = c.id), '[]'::jsonb),
    'rule_links', coalesce((select jsonb_agg(to_jsonb(r) order by r.rule_id) from public.integrity_case_rule_links r where r.case_id = c.id), '[]'::jsonb),
    'findings', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at, f.id) from public.integrity_case_findings f where f.case_id = c.id), '[]'::jsonb),
    'reviewers', coalesce((select jsonb_agg(jsonb_build_object('user_id', rv.user_id, 'email', au.email, 'review_role', rv.review_role, 'assigned_at', rv.assigned_at, 'recused_at', rv.recused_at, 'recusal_reason', rv.recusal_reason) order by rv.assigned_at) from public.integrity_case_reviewers rv left join auth.users au on au.id = rv.user_id where rv.case_id = c.id), '[]'::jsonb),
    'relations', coalesce((select jsonb_agg(jsonb_build_object('id', rel.id, 'related_case_id', rel.related_case_id, 'related_public_code', rc.public_code, 'relation_type', rel.relation_type, 'note', rel.note, 'created_at', rel.created_at) order by rel.created_at) from public.integrity_case_relations rel join public.integrity_cases rc on rc.id = rel.related_case_id where rel.case_id = c.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(rq) order by rq.created_at) from public.integrity_case_requests rq where rq.case_id = c.id), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ev.id,
          'source_role', ev.source_role,
          'evidence_type', ev.evidence_type,
          'title', ev.title,
          'description', ev.description,
          'external_url', ev.external_url,
          'original_name', ev.original_name,
          'mime_type', ev.mime_type,
          'size_bytes', ev.size_bytes,
          'provenance', ev.provenance,
          'redacted_from_id', ev.redacted_from_id,
          'disclosure_copy_of_id', ev.disclosure_copy_of_id,
          'visible_to_reporter', ev.visible_to_reporter,
          'lifecycle_status', ev.lifecycle_status,
          'retention_until', ev.retention_until,
          'deletion_reason', ev.deletion_reason,
          'deleted_at', ev.deleted_at,
          'created_at', ev.created_at
        ) order by ev.created_at, ev.id
      )
      from public.integrity_case_evidence ev
      where ev.case_id = c.id
    ), '[]'::jsonb)
  ) from public.integrity_cases c where c.id = _case_id);
end;
$$;
revoke all on function public.admin_integrity_case(uuid) from public;
grant execute on function public.admin_integrity_case(uuid) to authenticated;

-- Once scheduled retention has actually expired, organizers must complete or
-- cancel the lifecycle action rather than continuing to mint download links.
create or replace function public.admin_integrity_evidence_access_descriptor(
  _evidence_id uuid,
  _action text default 'access_descriptor'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_case_id uuid;
  v_path text;
  v_name text;
  v_mime text;
begin
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if _action not in ('access_descriptor', 'download_requested') then raise exception 'Invalid evidence access action'; end if;

  select case_id, storage_path, original_name, mime_type
  into v_case_id, v_path, v_name, v_mime
  from public.integrity_case_evidence
  where id = _evidence_id
    and storage_path is not null
    and (
      lifecycle_status = 'active'
      or (lifecycle_status = 'scheduled_for_deletion' and retention_until > now())
    );
  if v_case_id is null or v_path is null then raise exception 'Evidence file is not available'; end if;

  insert into public.integrity_evidence_access_log(evidence_id, case_id, actor_user_id, actor_role, action)
  values (_evidence_id, v_case_id, auth.uid(), 'organizer', _action);

  return jsonb_build_object(
    'bucket', 'integrity-evidence',
    'storage_path', v_path,
    'original_name', v_name,
    'mime_type', v_mime
  );
end;
$$;
revoke all on function public.admin_integrity_evidence_access_descriptor(uuid, text) from public;
grant execute on function public.admin_integrity_evidence_access_descriptor(uuid, text) to authenticated;

commit;
