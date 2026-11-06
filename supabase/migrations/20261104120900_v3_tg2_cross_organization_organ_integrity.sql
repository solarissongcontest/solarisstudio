begin;

-- TG2 institutional authority must not permit cross-organization organ edges.
-- A simple FK to an organ ID proves the organ exists, but not that the organ
-- belongs to the organization that owns the office or world capability scope.
-- The composite parent key prevents malformed authorization scope and history.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-organ-organization-integrity',
      1,
      'forward_fix_only',
      false,
      null,
      'Bind institutional offices and organ-scoped capability grants to an organ belonging to their own organization.'
    );
  end if;
end
$contract$;

-- TG6 session/agenda migration already uses this exact index name. Reuse it
-- in either deployment order rather than adding an unnecessary duplicate key.
create unique index if not exists world_organs_id_organization_uidx
  on public.world_organization_organs(id, organization_id);

alter table public.world_organization_offices
  add constraint world_offices_organ_same_organization_fk
  foreign key (organ_id, organization_id)
  references public.world_organization_organs(id, organization_id)
  on update restrict on delete restrict;

alter table public.world_capability_grant_scopes
  add constraint world_grant_scopes_organ_same_organization_fk
  foreign key (organ_id, organization_id)
  references public.world_organization_organs(id, organization_id)
  on update restrict on delete restrict;

-- organ_id is optional in both children. PostgreSQL's default MATCH SIMPLE
-- intentionally permits null organ_id for organization-wide office/grant scope.
-- The non-null organization_id remains independently validated by its own FK.

comment on constraint world_offices_organ_same_organization_fk
on public.world_organization_offices is
  'An office may reference only an organ of its owning world organization.';

comment on constraint world_grant_scopes_organ_same_organization_fk
on public.world_capability_grant_scopes is
  'A private grant scoped to an organ cannot cross an organization boundary.';

commit;
