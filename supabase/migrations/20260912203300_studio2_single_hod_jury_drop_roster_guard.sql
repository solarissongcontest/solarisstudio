begin;

-- Jury size is no longer mutable: it is the invariant value 1 because the HOD
-- is the country's sole jury. The old trigger compared the configurable size to
-- rows in the deprecated Studio 2 roster and froze that size after a ballot was
-- submitted. Both behaviours belong to the abandoned multi-member jury model.
drop trigger if exists studio2_delegation_settings_guard_requirement
  on public.studio2_delegation_settings;

drop function if exists private.studio2_guard_jury_requirement();

notify pgrst, 'reload schema';

commit;
