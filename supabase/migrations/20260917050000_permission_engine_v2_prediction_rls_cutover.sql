begin;

-- Permission Engine v2 cutover batch 20.
--
-- Prediction Arena's remaining RLS Organizer checks are policy-level rather
-- than function-level. Resolve the canonical edition through the round's show
-- inside a private SECURITY DEFINER helper so specialist capability checks do
-- not depend on the caller being able to read the show row through unrelated
-- RLS first.

create or replace function private.studio2_show_access_allowed(
  p_capability text,
  p_show_id uuid,
  p_strict_before_cutover boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'private', 'pg_temp'
as $function$
  select coalesce((
    select public.studio2_access_allowed(
      p_capability,
      s.edition_id,
      p_strict_before_cutover
    )
    from public.shows s
    where s.id = p_show_id
  ), false);
$function$;

revoke all on function private.studio2_show_access_allowed(text, uuid, boolean)
from public, anon, authenticated, service_role;

-- Preserve full management semantics, replacing only the legacy Organizer gate.
drop policy if exists "organizers manage prediction rounds" on public.prediction_rounds;
create policy "organizers manage prediction rounds"
on public.prediction_rounds
for all
to authenticated
using (
  private.studio2_show_access_allowed('voting.manage', show_id, false)
)
with check (
  private.studio2_show_access_allowed('voting.manage', show_id, false)
);

-- Preserve the public availability path exactly. Only the elevated unpublished
-- visibility bypass moves from Organizer to edition-scoped voting.manage.
drop policy if exists "public reads published prediction rounds" on public.prediction_rounds;
create policy "public reads published prediction rounds"
on public.prediction_rounds
for select
to anon, authenticated
using (
  (
    status = any (array['open'::text, 'locked'::text, 'scoring'::text, 'scored'::text])
    and public.show_publication_enabled(show_id, 'participants'::text)
  )
  or private.studio2_show_access_allowed('voting.manage', show_id, false)
);

notify pgrst, 'reload schema';

commit;
