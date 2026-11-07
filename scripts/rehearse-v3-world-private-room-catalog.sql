-- TG19 / TG11 / TG12. Disposable local PostgreSQL catalog verification.
-- No user records, room fixtures, migrations or any other data writes.
-- The role grants are inspectable even while terra_private_spaces/chat are off.
begin transaction read only;

do $private_room_catalog$
declare
  v_relation_name text;
  v_relation regclass;
  v_role text;
  v_privilege text;
  v_function text;
  v_qualified_private_tables text[] := array[
    'private.world_space_access_grants',
    'private.world_space_grant_audit',
    'private.world_space_messages',
    'private.world_space_message_revisions',
    'private.world_space_reactions',
    'private.world_space_attachments'
  ];
  v_protected_tables text[] := array[
    'public.world_spaces',
    'private.world_space_access_grants',
    'private.world_space_grant_audit',
    'private.world_space_messages',
    'private.world_space_message_revisions',
    'private.world_space_reactions',
    'private.world_space_attachments'
  ];
  v_public_rpc_signatures text[] := array[
    'public.world_my_workspaces_v1()',
    'public.world_workspace_context_v1(text)',
    'public.world_spaces_list_v1(text)',
    'public.world_space_candidates_v1(uuid)',
    'public.world_space_create_v1(uuid,text,text,text,text,uuid,uuid)',
    'public.world_space_set_grant_v1(uuid,uuid,text,timestamptz,boolean,bigint,uuid)',
    'public.world_space_messages_v1(uuid,uuid,integer)',
    'public.world_space_search_v1(uuid,text,integer)',
    'public.world_space_send_v1(uuid,text,uuid,uuid)',
    'public.world_space_edit_v1(uuid,bigint,text)',
    'public.world_space_set_reaction_v1(uuid,text,boolean)',
    'public.world_space_moderate_v1(uuid,text,bigint)'
  ];
  v_private_rpc_signatures text[] := array[
    'private.world_space_lock_actor_membership_v1(uuid)',
    'private.world_space_lock_member_for_space_v1(uuid)',
    'private.world_space_member_since_for_v1(uuid,uuid)',
    'private.world_space_member_since_v1(uuid)',
    'private.world_space_read_from_v1(uuid)'
  ];
begin
  if to_regclass('public.studio2_feature_flags') is null then
    raise exception 'TG19_PRIVATE_ROOM_FLAG_REGISTRY_MISSING';
  end if;
  if not exists (
    select 1 from public.studio2_feature_flags
    where key = 'terra_private_spaces' and enabled = false
  ) or not exists (
    select 1 from public.studio2_feature_flags
    where key = 'terra_chat' and enabled = false
  ) then
    raise exception 'TG19_PRIVATE_ROOM_FLAGS_MUST_REMAIN_DARK';
  end if;

  -- PostgreSQL RLS is enabled on private room tables, even though ordinary
  -- clients do not receive direct table grants. Defense in depth is mandatory.
  foreach v_relation_name in array v_protected_tables loop
    v_relation := to_regclass(v_relation_name);
    if v_relation is null then
      raise exception 'TG19_PRIVATE_ROOM_RELATION_MISSING: %', v_relation_name;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_class rel
      where rel.oid = v_relation::oid and rel.relkind in ('r', 'p')
        and rel.relrowsecurity = true
    ) then
      raise exception 'TG19_PRIVATE_ROOM_RLS_OFF: %', v_relation_name;
    end if;
  end loop;

  -- Neither anonymous visitors nor authenticated clients can bypass the
  -- server RPC boundary by selecting or changing the physical tables.
  foreach v_relation_name in array v_protected_tables loop
    v_relation := to_regclass(v_relation_name);
    foreach v_role in array array['anon','authenticated'] loop
      foreach v_privilege in array array[
        'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      ] loop
        if pg_catalog.has_table_privilege(v_role, v_relation, v_privilege) then
          raise exception 'TG19_PRIVATE_ROOM_DIRECT_GRANT: %.%:%',
            v_role, v_relation_name, v_privilege;
        end if;
      end loop;
    end loop;
  end loop;

  -- service_role credentials must not become an independent canonical
  -- writer to a chat room, private grants, immutable message revisions or
  -- grant audit. Official mutations go through governed SECURITY DEFINER RPCs.
  foreach v_relation_name in array v_protected_tables loop
    v_relation := to_regclass(v_relation_name);
    foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if pg_catalog.has_table_privilege('service_role', v_relation, v_privilege) then
        raise exception 'TG19_PRIVATE_ROOM_SERVICE_ROLE_WRITER: %:%',
          v_relation_name, v_privilege;
      end if;
    end loop;
  end loop;

  -- Private helper functions must not be callable directly from the Data API.
  foreach v_function in array v_private_rpc_signatures loop
    if to_regprocedure(v_function) is null then
      raise exception 'TG19_PRIVATE_ROOM_HELPER_MISSING: %', v_function;
    end if;
    foreach v_role in array array['anon','authenticated'] loop
      if pg_catalog.has_function_privilege(v_role, v_function, 'EXECUTE') then
        raise exception 'TG19_PRIVATE_ROOM_HELPER_PUBLIC_EXECUTE: %.%',
          v_role, v_function;
      end if;
    end loop;
  end loop;

  -- Publicly located RPCs are still PRIVATE operations. Authenticated
  -- callers are allowed to invoke them, but each RPC authorizes its actor.
  -- Anonymous callers should not even have EXECUTE grants.
  foreach v_function in array v_public_rpc_signatures loop
    if to_regprocedure(v_function) is null then
      raise exception 'TG19_PRIVATE_ROOM_PUBLIC_RPC_MISSING: %', v_function;
    end if;
    if pg_catalog.has_function_privilege('anon', v_function, 'EXECUTE') then
      raise exception 'TG19_PRIVATE_ROOM_ANON_RPC_EXECUTE: %', v_function;
    end if;
    if not pg_catalog.has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'TG19_PRIVATE_ROOM_AUTH_RPC_GRANT_MISSING: %', v_function;
    end if;
  end loop;
end
$private_room_catalog$;

-- Defensive additional no-JWT functional check: no authenticated session
-- is inferred merely from role impersonation. World private spaces remain
-- invisible without auth.uid(), even if a future system grants direct access.
set local role authenticated;
do $no_user$
begin
  if auth.uid() is not null then
    raise exception 'TG19_PRIVATE_ROOM_NO_JWT_EXPECTED';
  end if;
  if public.world_my_workspaces_v1() <> '[]'::jsonb then
    raise exception 'TG19_PRIVATE_ROOM_NO_JWT_WORKSPACE_LEAK';
  end if;
  if public.world_workspace_context_v1('guard') is not null then
    raise exception 'TG19_PRIVATE_ROOM_NO_JWT_CONTEXT_LEAK';
  end if;
  if public.world_spaces_list_v1('guard') <> '[]'::jsonb then
    raise exception 'TG19_PRIVATE_ROOM_NO_JWT_ROOMS_LEAK';
  end if;
end
$no_user$;
reset role;

rollback;
