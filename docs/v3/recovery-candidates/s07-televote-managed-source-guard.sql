-- S07 local source boundary. No production adoption authorization.
-- API roles cannot mint or retain this transaction/show-scoped writer context.
-- Actor permissions remain in existing commands; only the canonical materializer
-- creates this short-lived context, including for authenticated publication hooks.
create table private.v3_televote_projection_write_context (
  transaction_id xid8 not null,
  show_id uuid not null,
  primary key (transaction_id, show_id)
);
revoke all on private.v3_televote_projection_write_context
  from public, anon, authenticated, service_role;

create or replace function private.v3_guard_source_managed_televote_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_show_id uuid;
  v_previous_show_id uuid;
begin
  if tg_op = 'DELETE' then
    v_show_id := old.show_id;
  else
    v_show_id := new.show_id;
    if tg_op = 'UPDATE' then v_previous_show_id := old.show_id; end if;
  end if;
  if exists (
    select 1 from private.v3_televote_result_projection_sources source
    where source.show_id = v_show_id
       or (tg_op='UPDATE' and source.show_id=v_previous_show_id)
  ) and (
    not exists (
      select 1 from private.v3_televote_projection_write_context writer
      where writer.transaction_id=pg_current_xact_id() and writer.show_id=v_show_id
    ) or (
      tg_op='UPDATE' and v_previous_show_id is distinct from v_show_id
      and not exists (
        select 1 from private.v3_televote_projection_write_context writer
        where writer.transaction_id=pg_current_xact_id() and writer.show_id=v_previous_show_id
      )
    )
  ) then
    raise exception 'Published Televote projection is server-managed for this show'
      using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$guard$;
