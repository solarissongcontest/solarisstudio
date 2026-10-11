begin;

-- Confirmations now projects the canonical Solaris edition table. Its legacy
-- save RPC therefore acts only as an idempotent compatibility assertion: it may
-- confirm that the caller is looking at the current canonical row, but it must
-- never become a second API for changing core edition metadata.
create or replace function public.admin_confirmation_save_edition(_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $save$
declare
  v_id uuid := nullif(_payload ->> 'id', '')::uuid;
  v_number integer := nullif(_payload ->> 'edition_number', '')::integer;
  v_name text := nullif(btrim(_payload ->> 'name'), '');
  v_description text := nullif(btrim(_payload ->> 'description'), '');
  v_status text := coalesce(nullif(_payload ->> 'status', ''), 'draft');
  v_existing_number integer;
  v_existing_name text;
  v_existing_description text;
  v_existing_status text;
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  if v_id is null then
    raise exception
      'Confirmations cannot create canonical editions. Create the edition in Organizer edition management first.'
      using errcode = '55000';
  end if;

  select
    edition.edition_number,
    edition.name,
    nullif(btrim(edition.description), ''),
    case when edition.status = 'completed' then 'finished' else edition.status end
  into
    v_existing_number,
    v_existing_name,
    v_existing_description,
    v_existing_status
  from public.editions edition
  where edition.id = v_id;

  if not found then
    raise exception 'Canonical edition not found' using errcode = 'P0002';
  end if;

  if v_number is distinct from v_existing_number
     or v_name is distinct from v_existing_name
     or v_description is distinct from v_existing_description
     or v_status is distinct from v_existing_status then
    raise exception
      'Canonical edition metadata is managed by Organizer edition management. Refresh the delegation edition view.'
      using errcode = '55000';
  end if;

  return v_id;
end
$save$;

revoke all on function public.admin_confirmation_save_edition(jsonb)
  from public, anon;
grant execute on function public.admin_confirmation_save_edition(jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
