begin;

-- System V3 / S14 forward fix.
--
-- studio2_transition_edition_v3 is a browser-facing governed operation. Its
-- stale-version and illegal-state branches are deterministic application
-- conflicts, not PostgreSQL serialization failures. PostgREST treats SQLSTATE
-- 40001 as retryable, so keeping 40001 here can replay a command that is known
-- to be stale and eventually surface as a gateway failure instead of HTTP 409.
--
-- Keep the genuine DomainEvent worker lease conflict on 40001. Only the exact
-- V3 lifecycle command definition is rewritten.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.transition-http409',
  1,
  'forward_fix_only',
  false,
  null,
  'Normalize deterministic edition lifecycle conflicts to PostgREST HTTP 409 while retaining genuine DomainEvent worker serialization semantics.'
)
on conflict (migration_key) do nothing;

do $normalize_transition_conflicts$
declare
  v_signature constant text :=
    'public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)';
  v_function regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_function := to_regprocedure(v_signature);
  if v_function is null then
    raise exception 'Canonical V3 edition transition function is missing';
  end if;

  select pg_get_functiondef(v_function::oid)
  into v_definition;

  if position('''40001''' in v_definition) = 0 then
    raise exception
      'Expected deterministic SQLSTATE 40001 was not found in %; review the forward fix instead of silently skipping it',
      v_signature;
  end if;

  v_rewritten := replace(v_definition, '''40001''', '''PT409''');
  if v_rewritten is not distinct from v_definition then
    raise exception 'Could not normalize V3 edition transition conflicts';
  end if;

  execute v_rewritten;

  v_function := to_regprocedure(v_signature);
  if v_function is null then
    raise exception 'V3 edition transition function identity changed during normalization';
  end if;

  select pg_get_functiondef(v_function::oid)
  into v_definition;

  if position('''40001''' in v_definition) > 0 then
    raise exception 'Deterministic SQLSTATE 40001 remains in V3 edition transition';
  end if;
  if position('''PT409''' in v_definition) = 0 then
    raise exception 'HTTP 409 SQLSTATE was not installed in V3 edition transition';
  end if;
end
$normalize_transition_conflicts$;

-- The archive consumer is a leased S4 worker boundary. Its lost/stale lease is
-- a genuine retry/serialization condition and must remain 40001.
do $assert_worker_retry_semantics$
declare
  v_worker regprocedure;
  v_definition text;
begin
  v_worker := to_regprocedure(
    'public.studio2_process_edition_domain_event(uuid,text,text)'
  );
  if v_worker is null then
    raise exception 'Canonical edition DomainEvent consumer is missing';
  end if;

  select pg_get_functiondef(v_worker::oid)
  into v_definition;

  if position('''40001''' in v_definition) = 0 then
    raise exception
      'Edition DomainEvent lease conflict no longer retains genuine serialization retry semantics';
  end if;
end
$assert_worker_retry_semantics$;

notify pgrst, 'reload schema';

commit;
