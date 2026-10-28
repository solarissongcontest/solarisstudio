begin;

select public.v3_register_migration_contract(
  'v3.integrity.internal-search-path-hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Pin sanctioned Integrity implementation primitives to safe search paths after legacy RPC renames'
);

alter function public.public_create_anonymous_integrity_case_impl(text, text, text, text, text, text[], text, text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.create_protected_integrity_case_impl(text, text, text, text, text, text, text, text[], text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.v3_public_create_anonymous_integrity_case_impl(uuid, text, text, text, text, text, text, text[], text, text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.v3_create_protected_integrity_case_impl(uuid, text, text, text, text, text, text, text, text, text[], text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.reporter_submit_integrity_appeal_impl(uuid, uuid, text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.public_submit_anonymous_integrity_appeal_impl(text, text, uuid, text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.admin_set_integrity_priority_impl(uuid, text)
  set search_path = pg_catalog, public, private;
alter function public.admin_reply_integrity_case_impl(uuid, text, boolean)
  set search_path = pg_catalog, public, private;
alter function public.admin_record_integrity_finding_impl(uuid, text, text, text, text[], boolean)
  set search_path = pg_catalog, public, private;
alter function public.admin_record_integrity_sanction_impl(uuid, uuid, integer, integer, text, text, text[], text[], text, boolean)
  set search_path = pg_catalog, public, private;
alter function public.reporter_reply_integrity_case_impl(uuid, text)
  set search_path = pg_catalog, public, private;
alter function public.public_reply_anonymous_integrity_case_impl(text, text, text)
  set search_path = pg_catalog, public, private, extensions;
alter function public.admin_recuse_from_integrity_case_impl(uuid, text)
  set search_path = pg_catalog, public, private;
alter function public.admin_add_integrity_case_note_impl(uuid, text)
  set search_path = pg_catalog, public, private;
alter function public.admin_record_integrity_preclearance_ruling_impl(uuid, text, text, text, text[])
  set search_path = pg_catalog, public, private;
alter function public.admin_set_integrity_case_retention_impl(uuid, timestamptz, text)
  set search_path = pg_catalog, public, private;

notify pgrst, 'reload schema';
commit;
