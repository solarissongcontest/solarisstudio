-- TG3 Country Section public-visibility regression.
-- Disposable local Supabase only. Entire fixture rolls back.
\set ON_ERROR_STOP on
begin;
do $seed$
declare
  v_country uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
begin
  insert into public.countries(id,name,short_code)
  values (v_country,'TG3 Publication Rehearsal','ZQP');
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_owner,'authenticated','authenticated',v_owner::text || '@tg3-publication.invalid',now(),now()),
    (v_outsider,'authenticated','authenticated',v_outsider::text || '@tg3-publication.invalid',now(),now());
  insert into public.country_accounts(user_id,country_id,status)
  values (v_owner,v_country,'active');
  perform set_config('solaris.tg3_publication_owner',v_owner::text,true);
  perform set_config('solaris.tg3_publication_outsider',v_outsider::text,true);
  insert into public.country_profile_sections
    (country_id,heading,body,visible_on_country,visible_on_wiki)
  values
    (v_country,'both-hidden','Unpublished text',false,false),
    (v_country,'country-only','Published on Country',true,false),
    (v_country,'wiki-only','Published on Wiki',false,true),
    (v_country,'both-public','Published on both',true,true);
  perform set_config('solaris.tg3_publication_fixture',v_country::text,true);
end
$seed$;

set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $anonymous$
declare
  v_country uuid := current_setting('solaris.tg3_publication_fixture')::uuid;
begin
  if (select count(*) from public.country_profile_sections where country_id=v_country) <> 3 then
    raise exception 'TG3_ANON_SAW_HIDDEN_OR_LOST_PUBLIC_ROWS';
  end if;
  if exists (select 1 from public.country_profile_sections
             where country_id=v_country and heading='both-hidden') then
    raise exception 'TG3_ANON_HIDDEN_SECTION_LEAK';
  end if;
  begin
    insert into public.country_profile_sections(country_id,heading,body)
    values (v_country,'unauthorized','no');
    raise exception 'TG3_ANON_DIRECT_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: TG3 anonymous access restricted to Country/Wiki published content';
end
$anonymous$;
reset role;

set local request.jwt.claim.role = 'authenticated';
set local role authenticated;
do $outsider$
declare
  v_country uuid := current_setting('solaris.tg3_publication_fixture')::uuid;
  v_updated integer;
begin
  -- A real unrelated auth.users identity, not just an auth role without JWT.
  perform set_config('request.jwt.claim.sub',current_setting('solaris.tg3_publication_outsider'),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('solaris.tg3_publication_outsider'),
    'role','authenticated')::text,true);
  if (select count(*) from public.country_profile_sections where country_id=v_country) <> 3
     or exists (select 1 from public.country_profile_sections
                where country_id=v_country and heading='both-hidden') then
    raise exception 'TG3_SIGNED_IN_OUTSIDER_SAW_HIDDEN_CONTENT';
  end if;
  begin
    update public.country_profile_sections
      set body='OUTSIDER MUST NOT CHANGE THIS'
      where country_id=v_country and heading='both-hidden';
    get diagnostics v_updated = row_count;
    if v_updated <> 0 then
      raise exception 'TG3_SIGNED_IN_OUTSIDER_EDITED_HIDDEN_CONTENT';
    end if;
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS: unrelated authenticated user cannot read or edit hidden sections';
end
$outsider$;

-- An active controller must still read its own unpublished material for
-- MySolaris editing. The direct SELECT is an RLS assertion, not a mock.
do $owner$
declare
  v_country uuid := current_setting('solaris.tg3_publication_fixture')::uuid;
  v_updated integer;
begin
  perform set_config('request.jwt.claim.sub',current_setting('solaris.tg3_publication_owner'),true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',current_setting('solaris.tg3_publication_owner'),
    'role','authenticated')::text,true);
  if not public.owns_country(v_country) then
    raise exception 'TG3_COUNTRY_OWNER_FIXTURE_INVALID';
  end if;
  if (select count(*) from public.country_profile_sections where country_id=v_country) <> 4
     or not exists (select 1 from public.country_profile_sections
                    where country_id=v_country and heading='both-hidden') then
    raise exception 'TG3_ACTIVE_COUNTRY_CONTROLLER_LOST_EDITOR_READS';
  end if;
  update public.country_profile_sections
    set body='Owner can still edit unpublished content'
    where country_id=v_country and heading='both-hidden';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'TG3_ACTIVE_COUNTRY_CONTROLLER_CANNOT_EDIT_DRAFT';
  end if;
  raise notice 'PASS: active country controller reads and edits private draft';
end
$owner$;
reset role;
set local request.jwt.claim.role = '';
set local request.jwt.claim.sub = '';
rollback;
