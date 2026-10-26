begin;

-- Preserve the pre-#702 raw-table read authority. Confirmation operators get
-- their exact-edition binding projection through the governed RPC; granting
-- delegation.manage direct visibility into every integration service would be
-- unnecessary privilege expansion.
drop policy if exists "integration links organizer read" on public.integration_links;
create policy "integration links organizer read"
on public.integration_links
for select
to authenticated
using (public.studio2_access_allowed('edition.manage', edition_id, false));

commit;
