begin;

select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.results.current-lineup-reconciliation', 1, 'forward_fix_only', false, null,
  'Reconcile obsolete mutable Results projections only during guarded canonical calculation; preserve immutable versions and current rows.'
);
select set_config('request.jwt.claim.role', '', true);

-- Derive from the installed executor to retain subsequent conflict-transport
-- repairs, authorization, locking, idempotency, versioning and existing ACLs.
-- Withdrawal intentionally preserves historical scores. Only an explicit
-- unpublished/unlocked calculate replaces that projection with current truth.
do $repair$
declare
  v_definition text := pg_get_functiondef(
    'public.studio2_execute_result_operation(uuid,text,text,uuid,bigint)'::regprocedure
  );
  v_anchor text := '    v_materialized := public.materialize_show_results_if_missing(p_show_id);';
  v_reconcile text := $body$
    -- Reconcile the mutable projection after every calculate guard and before
    -- scoring. Immutable v3_result_versions remain untouched.
    delete from public.results r
    where r.show_id = p_show_id
      and not exists (
        select 1 from public.participants p
        where p.show_id = p_show_id
          and coalesce(p.participation_status, 'confirmed') = 'confirmed'
          and coalesce(p.country_id, p.contest_entity_id)
              = coalesce(r.country_id, r.contest_entity_id)
      );
$body$;
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'Expected exactly one canonical Results calculation anchor';
  end if;
  execute replace(v_definition, v_anchor, v_reconcile || E'\n' || v_anchor);
end
$repair$;

commit;
