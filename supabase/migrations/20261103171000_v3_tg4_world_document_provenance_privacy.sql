begin;

-- TG4 privacy hardening. Row-level security cannot redact selected columns.
-- Public/member published legal text must not expose privileged import
-- provenance or internal artifact storage locators through PostgREST SELECT *.
-- Keep all existing row-level visibility policies and server-side projections.
revoke select on table public.world_document_versions from anon, authenticated;
grant select (
  id, document_id, version_number, title,
  structured_content, plain_text, effective_from, effective_to,
  publication_state, published_at, supersedes_version_id,
  superseded_by_version_id, content_hash, record_class,
  revision, created_at, updated_at
) on table public.world_document_versions to anon, authenticated;

revoke select on table public.world_document_artifacts from anon, authenticated;
grant select (
  id, document_version_id, artifact_format, status,
  generated_at, content_hash, created_at
) on table public.world_document_artifacts to anon, authenticated;

-- Manager-only provenance is never available through raw browser table
-- grants. The authoritative service-role layer remains able to reconcile
-- source metadata and private export/storage references when needed.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-provenance-privacy',
      1,
      'forward_fix_only',
      false,
      null,
      'Restrict public/member Data API column grants on legal versions and artifacts so source provenance and storage locators do not leak through otherwise valid published-row RLS.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
