-- Run only against isolated local Supabase through the guarded wrapper.
-- All inserted canonical country/profile fixtures are transaction-rolled back.
\set ON_ERROR_STOP on
begin;

do $fixture$
declare
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_country uuid := gen_random_uuid();
  v_country_article uuid := gen_random_uuid();
  v_wiki_article uuid := gen_random_uuid();
  v_hidden_article uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_owner,'authenticated','authenticated',v_owner::text || '@tg3-publication.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text || '@tg3-publication.invalid',now(),now());
  insert into public.countries(id,name,short_code)
  values (v_country,'TG3 World Publication Fixture','ZXV');
  insert into public.country_accounts(user_id,country_id,status)
  values (v_owner,v_country,'active');

  insert into public.country_profile_sections(
    id,country_id,heading,body,sort_order,visible_on_country,visible_on_wiki
  ) values
    (v_country_article,v_country,'Government','Published on Country',0,true,false),
    (v_wiki_article,v_country,'Constitution','Published on Wiki',1,false,true),
    (v_hidden_article,v_country,'Secret draft','Hidden on both public surfaces',2,false,false);

  perform set_config('solaris.world_publication_fixture',jsonb_build_object(
    'owner',v_owner,'outsider',v_outsider,'country',v_country,
    'countryArticle',v_country_article,'wikiArticle',v_wiki_article,
    'hiddenArticle',v_hidden_article
  )::text,true);
end
$fixture$;

set local role anon;
do $anon$
declare
  v jsonb := current_setting('solaris.world_publication_fixture')::jsonb;
  v_country uuid := (v->>'country')::uuid;
  v_hidden uuid := (v->>'hiddenArticle')::uuid;
begin
  if (select count(*) from public.country_profile_sections
      where country_id = v_country) <> 2 then
    raise exception 'TG3_ANON_PUBLIC_SECTIONS_INCORRECT';
  end if;
  if exists (select 1 from public.country_profile_sections where id=v_hidden) then
    raise exception 'TG3_ANON_HIDDEN_SECTION_DISCLOSURE';
  end if;
  raise notice 'PASS: anon sees only expressly published Country/Wiki sections';
end
$anon$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare
  v jsonb := current_setting('solaris.world_publication_fixture')::jsonb;
  v_country uuid := (v->>'country')::uuid;
  v_hidden uuid := (v->>'hiddenArticle')::uuid;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'outsider','role','authenticated'
  )::text,true);
  if (select count(*) from public.country_profile_sections
      where country_id = v_country) <> 2 then
    raise exception 'TG3_OUTSIDER_PUBLIC_SECTIONS_INCORRECT';
  end if;
  if exists (select 1 from public.country_profile_sections where id=v_hidden) then
    raise exception 'TG3_OUTSIDER_HIDDEN_SECTION_DISCLOSURE';
  end if;
  raise notice 'PASS: authenticated outsider cannot read hidden author draft';
end
$outsider$;
reset role;
set local request.jwt.claim.role = '';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $owner$
declare
  v jsonb := current_setting('solaris.world_publication_fixture')::jsonb;
  v_country uuid := (v->>'country')::uuid;
  v_hidden uuid := (v->>'hiddenArticle')::uuid;
  v_updated integer;
begin
  perform set_config('request.jwt.claim.sub',v->>'owner',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'owner','role','authenticated'
  )::text,true);
  if not public.owns_country(v_country) then
    raise exception 'TG3_OWNER_FIXTURE_ACCESS_INVALID';
  end if;
  if (select count(*) from public.country_profile_sections
      where country_id = v_country) <> 3
     or not exists (select 1 from public.country_profile_sections where id=v_hidden) then
    raise exception 'TG3_OWNER_UNABLE_TO_READ_UNPUBLISHED_DRAFT';
  end if;
  update public.country_profile_sections
    set body = 'Owner can still edit hidden draft'
    where id = v_hidden;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'TG3_OWNER_UNABLE_TO_EDIT_UNPUBLISHED_DRAFT';
  end if;
  raise notice 'PASS: current country controller sees and edits their hidden drafts';
end
$owner$;
reset role;
set local request.jwt.claim.role = '';
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{}';

rollback;
