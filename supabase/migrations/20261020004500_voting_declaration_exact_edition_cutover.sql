begin;

select public.v3_register_migration_contract(
  '20261020004500_voting_declaration_exact_edition_cutover',
  1,
  'forward_fix_only',
  false,
  null,
  'Cut authenticated Organizer callers over to exact-edition voting declaration invalidation overloads.'
);

-- The only repository Organizer consumer is migrated in this slice. Keep the
-- legacy signatures service-compatible for controlled migration/rehearsal use,
-- but remove them as competing authenticated browser authorities.
revoke execute on function public.studio2_voting_declaration_invalidation_preview(uuid)
  from authenticated;
revoke execute on function public.studio2_apply_voting_declaration_invalidation(
  uuid, text, uuid, text, bigint
) from authenticated;

grant execute on function public.studio2_voting_declaration_invalidation_preview(uuid)
  to service_role;
grant execute on function public.studio2_apply_voting_declaration_invalidation(
  uuid, text, uuid, text, bigint
) to service_role;

comment on function public.studio2_voting_declaration_invalidation_preview(uuid) is
  'Legacy service-role compatibility overload. Authenticated Organizer callers must supply the expected edition via the two-argument V3 overload.';
comment on function public.studio2_apply_voting_declaration_invalidation(uuid, text, uuid, text, bigint) is
  'Legacy service-role compatibility overload. Authenticated Organizer callers must use the exact-edition V3 invalidation command.';

commit;
