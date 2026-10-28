begin;
select public.v3_register_migration_contract(
  'v3.edition.metadata-audit-vocabulary', 1, 'forward_fix_only', false, null,
  'Extend the existing contest audit vocabulary for canonical edition metadata commands without deleting any previously valid event type. Transactional authority rehearsals prove failed audit writes cannot acknowledge success.'
);

-- Preserve the deployed vocabulary exactly and add only the metadata fact.
-- Extracting the expression from pg_catalog also preserves any newer valid
-- audit vocabulary adopted by another migration before this one.
do $vocabulary$
declare
  v_expression text;
begin
  select pg_get_expr(c.conbin, c.conrelid) into strict v_expression
  from pg_constraint c
  where c.conrelid = 'public.studio2_contest_events'::regclass
    and c.conname = 'studio2_contest_events_type_check';
  alter table public.studio2_contest_events drop constraint studio2_contest_events_type_check;
  execute format(
    'alter table public.studio2_contest_events add constraint studio2_contest_events_type_check check ((%s) or type = %L)',
    v_expression, 'edition.metadata_changed'
  );
end
$vocabulary$;
commit;
