\set ON_ERROR_STOP on
-- Synthetic, rollback-only regression. Run only through the isolated local
-- rehearsal; no real contest rows, authorization fixtures or receipts survive.
BEGIN;
DO $regression$
DECLARE
  v_edition uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_country uuid[] := array[]::uuid[];
  v_show uuid;
  v_entity uuid;
  v_solo_edition uuid;
  v_solo_show uuid;
  v_solo_copy uuid;
  v_kind text;
  v_claims text;
  v_history jsonb;
  v_original jsonb;
  v_response jsonb;
  v_preview jsonb;
  v_public jsonb;
  v_raw_count integer;
  v_config jsonb := '{"participants":true,"qualifiers":true,"results":true,"jury_results":true,"televote_results":true}'::jsonb;
  v_execution uuid;
  v_publish uuid;
  v_expected bigint;
  v_rejected boolean;
  v_failures text[] := array[]::text[];
  v_id uuid;
  i integer;
BEGIN
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
  VALUES(v_actor,'authenticated','authenticated',v_actor::text||'@results.local.invalid',now(),now());
  INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
  VALUES(v_session,v_actor,now(),now(),'aal1',now()+interval '1 hour');
  v_claims := jsonb_build_object(
    'sub',v_actor,'role','authenticated','session_id',v_session,
    'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())))
  )::text;
  INSERT INTO public.editions(id,name,slug,status,published)
  VALUES(v_edition,'Active Results snapshot regression','active-snapshot-'||v_edition,'active',false);
  INSERT INTO public.studio2_capability_grants(user_id,capability,edition_id)
  VALUES(v_actor,'results.verify',v_edition),
        (v_actor,'publishing.publish',v_edition),
        (v_actor,'publishing.manage',v_edition);
  FOR i IN 1..7 LOOP
    v_id := gen_random_uuid();
    v_country := array_append(v_country,v_id);
    INSERT INTO public.countries(id,name,short_code)
    VALUES(v_id,'Snapshot country '||i,substr(replace(v_id::text,'-',''),1,8));
  END LOOP;

  FOREACH v_kind IN ARRAY ARRAY['semi-final','grand-final'] LOOP
    v_show := gen_random_uuid();
    INSERT INTO public.shows(id,edition_id,name,kind,published,qualifier_count,voting_config)
    VALUES(v_show,v_edition,'Active snapshot '||v_kind,v_kind,false,2,
      '{"juryEnabled":false,"televoteEnabled":true,"qualifiers":2,"juryPoints":[12,10,8]}'::jsonb);
    v_entity := null;
    IF v_kind='grand-final' THEN
      v_entity := gen_random_uuid();
      INSERT INTO public.contest_entities(id,edition_id,entity_type,display_name,abbreviation)
      VALUES(v_entity,v_edition,'custom','Official custom entrant','SNP');
    END IF;
    FOR i IN 1..7 LOOP
      INSERT INTO public.participants(edition_id,show_id,country_id,contest_entity_id,participation_status)
      VALUES(v_edition,v_show,CASE WHEN i=3 AND v_entity IS NOT NULL THEN null ELSE v_country[i] END,
        CASE WHEN i=3 THEN v_entity ELSE null END,CASE
        WHEN i<=3 THEN 'confirmed' WHEN i=4 THEN 'withdrawn'
        WHEN i=5 THEN 'disqualified' WHEN i=6 THEN 'pending' ELSE 'waitlist' END);
    END LOOP;
    INSERT INTO public.televote_votes(edition_id,show_id,country_id,contest_entity_id,points)
    VALUES(v_edition,v_show,v_country[1],null,30),
          (v_edition,v_show,v_country[2],null,20),
          (v_edition,v_show,CASE WHEN v_entity IS NOT NULL THEN null ELSE v_country[3] END,v_entity,10);
    INSERT INTO public.results(edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank)
    VALUES(v_edition,v_show,v_country[4],900,900,1800,1),
          (v_edition,v_show,v_country[5],800,800,1600,2)
    ON CONFLICT(show_id,country_id) WHERE show_id IS NOT NULL DO UPDATE
      SET jury_points=excluded.jury_points,televote_points=excluded.televote_points,
          total_points=excluded.total_points,final_rank=excluded.final_rank;
    SELECT jsonb_agg(to_jsonb(r) ORDER BY country_id) INTO v_history
    FROM public.results r WHERE show_id=v_show AND country_id IN(v_country[4],v_country[5]);
    -- Model a stale projection explicitly; the canonical calculation, not a
    -- fixture repair, must clear these historical identities' TRUE flags.
    UPDATE public.participants SET qualified=true
    WHERE show_id=v_show AND country_id IN(v_country[4],v_country[5]);

    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claims',v_claims,true);
    EXECUTE 'set local role authenticated';
    v_execution := gen_random_uuid();
    v_response := public.studio2_execute_result_operation(v_show,'calculate','Active official snapshot regression',v_execution,0);
    IF (v_response->>'calculationVersion')::integer <> 1 THEN
      RAISE EXCEPTION 'Authorized calculation failed: %',v_response;
    END IF;
    v_response := public.studio2_execute_result_operation(v_show,'calculate','Active official snapshot regression',v_execution,0);
    IF (v_response->>'idempotentReplay')::boolean IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Committed calculation exact retry did not recover';
    END IF;
    EXECUTE 'reset role';
    IF (SELECT result_row_count FROM private.v3_result_versions WHERE show_id=v_show AND version=1) <> 3 THEN
      v_failures := array_append(v_failures,v_kind||': snapshot contains historical/non-active identities');
    END IF;
    IF v_history IS DISTINCT FROM (
      SELECT jsonb_agg(to_jsonb(r) ORDER BY country_id) FROM public.results r
      WHERE show_id=v_show AND country_id IN(v_country[4],v_country[5])
    ) THEN RAISE EXCEPTION 'Calculation mutated archival Results'; END IF;
    IF v_kind='semi-final' AND (
      (SELECT count(*) FROM public.participants WHERE show_id=v_show AND qualified IS true) <> 2
      OR EXISTS(SELECT 1 FROM public.participants WHERE show_id=v_show
        AND country_id IN(v_country[4],v_country[5]) AND qualified IS DISTINCT FROM false)
    ) THEN
      v_failures := array_append(v_failures,'Inactive historical ranks nominate semifinal qualifiers');
    END IF;
    SELECT result_rows INTO v_original FROM private.v3_result_versions WHERE show_id=v_show AND version=1;

    -- Pending/waitlisted Results are not legitimate archival exceptions.
    FOR i IN 6..7 LOOP
      INSERT INTO public.results(edition_id,show_id,country_id,final_rank)
      VALUES(v_edition,v_show,v_country[i],null);
      v_rejected := false;
      BEGIN
        EXECUTE 'set local role authenticated';
        PERFORM public.studio2_execute_result_operation(v_show,'review','Reject invalid non-active Results',gen_random_uuid(),1);
      EXCEPTION WHEN SQLSTATE '55000' THEN v_rejected := true;
      END;
      EXECUTE 'reset role';
      IF NOT v_rejected THEN RAISE EXCEPTION 'Pending/waitlisted result passed review'; END IF;
      DELETE FROM public.results WHERE show_id=v_show AND country_id=v_country[i];
    END LOOP;

    -- A genuine recalculation creates a new version while retaining prior
    -- immutable evidence and the complete historical storage rows.
    EXECUTE 'set local role authenticated';
    PERFORM public.studio2_execute_result_operation(v_show,'calculate','Recalculate exact official version',gen_random_uuid(),1);
    PERFORM public.studio2_execute_result_operation(v_show,'review','Review exact official version',gen_random_uuid(),2);
    PERFORM public.studio2_execute_result_operation(v_show,'lock','Lock exact official version',gen_random_uuid(),2);
    PERFORM public.studio2_execute_result_operation(v_show,'mark_reveal_ready','Release exact official version',gen_random_uuid(),2);
    EXECUTE 'reset role';
    IF v_original IS DISTINCT FROM (SELECT result_rows FROM private.v3_result_versions WHERE show_id=v_show AND version=1) THEN
      RAISE EXCEPTION 'Recalculation rewrote prior immutable evidence';
    END IF;
    BEGIN
      UPDATE private.v3_result_versions SET result_rows='[]'::jsonb WHERE show_id=v_show AND version=1;
      RAISE EXCEPTION 'Immutable evidence update unexpectedly succeeded';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
    PERFORM set_config('request.jwt.claim.role','anon',true);
    EXECUTE 'set local role anon';
    IF public.v3_public_published_result_snapshot(v_show) IS NOT NULL THEN
      RAISE EXCEPTION 'Unpublished result snapshot leaked anonymously';
    END IF;
    IF EXISTS(SELECT 1 FROM public.results WHERE show_id=v_show) THEN
      RAISE EXCEPTION 'Unpublished raw Results leaked anonymously';
    END IF;
    EXECUTE 'reset role';

    PERFORM set_config('request.jwt.claims',v_claims,true);
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    EXECUTE 'set local role authenticated';
    v_preview := public.studio2_show_publication_change_preview(v_show,'public',v_config,null);
    v_expected := (v_preview->>'expectedVersion')::bigint;
    v_publish := gen_random_uuid();
    v_response := public.studio2_apply_show_publication_change(v_show,'public',v_config,null,v_publish,v_publish::text,v_expected);
    IF v_response->>'state' <> 'public' THEN RAISE EXCEPTION 'Canonical publication failed'; END IF;
    EXECUTE 'reset role';

    PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
    PERFORM set_config('request.jwt.claim.role','anon',true);
    EXECUTE 'set local role anon';
    v_public := public.v3_public_published_result_snapshot(v_show);
    SELECT count(*) INTO v_raw_count FROM public.results WHERE show_id=v_show;
    EXECUTE 'reset role';
    IF v_public IS NULL OR (v_public->>'resultVersion')::integer <> 2
       OR (v_public->>'rowCount')::integer <> 3
       OR jsonb_array_length(v_public->'rows') <> 3
       OR v_public#>>'{rows,0,countryId}' IS DISTINCT FROM v_country[1]::text
       OR (v_public#>>'{rows,0,finalRank}')::integer <> 1
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_public->'rows') row_value
           WHERE row_value->>'countryId' IN(v_country[4]::text,v_country[5]::text)) THEN
      v_failures := array_append(v_failures,v_kind||': anonymous official publication exposes inactive/wrong rankings');
    END IF;
    IF v_raw_count <> 3 THEN
      v_failures := array_append(v_failures,v_kind||': raw public Results differ from official frozen membership');
    END IF;
    IF v_entity IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_public->'rows') row_value
      WHERE row_value->>'contestEntityId'=v_entity::text AND row_value->>'countryId' IS NULL
    ) THEN RAISE EXCEPTION 'Official custom-entity identity was omitted or replaced'; END IF;
    IF v_history IS DISTINCT FROM (
      SELECT jsonb_agg(to_jsonb(r) ORDER BY country_id) FROM public.results r
      WHERE show_id=v_show AND country_id IN(v_country[4],v_country[5])
    ) THEN RAISE EXCEPTION 'Publication mutated historical Results'; END IF;

    -- Publication visibility is the intersection of show AND edition. This
    -- negative fixture rolls back the private-edition state in a subtransaction.
    BEGIN
      PERFORM set_config('request.jwt.claims','{}',true);
      PERFORM set_config('request.jwt.claim.role','',true);
      UPDATE public.editions SET published=false WHERE id=v_edition;
      PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
      PERFORM set_config('request.jwt.claim.role','anon',true);
      EXECUTE 'set local role anon';
      IF public.v3_public_published_result_snapshot(v_show) IS NOT NULL
         OR EXISTS(SELECT 1 FROM public.results WHERE show_id=v_show) THEN
        RAISE EXCEPTION 'A public show exposed official Results from a private edition';
      END IF;
      EXECUTE 'reset role';
      RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE='Rollback private-edition fixture';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
    END;

  END LOOP;

  -- Real governed withdrawal of the final eligible semifinal entrant updates
  -- zero active Results rows. It must still clear all edition appearances.
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM set_config('request.jwt.claim.role','',true);
  v_solo_edition := gen_random_uuid(); v_solo_show := gen_random_uuid(); v_solo_copy := gen_random_uuid();
  INSERT INTO public.editions(id,name,slug,status,published)
  VALUES(v_solo_edition,'Last active qualification','solo-'||v_solo_edition,'active',false);
  INSERT INTO public.studio2_capability_grants(user_id,capability,edition_id)
  VALUES(v_actor,'entry.approve',v_solo_edition);
  INSERT INTO public.shows(id,edition_id,name,kind,qualifier_count,voting_config)
  VALUES(v_solo_show,v_solo_edition,'Solo semifinal','semi-final',1,'{"juryEnabled":false,"televoteEnabled":false}'::jsonb),
        (v_solo_copy,v_solo_edition,'Solo final','grand-final',null,'{"juryEnabled":false,"televoteEnabled":false}'::jsonb);
  INSERT INTO public.participants(edition_id,show_id,country_id,participation_status)
  VALUES(v_solo_edition,v_solo_show,v_country[1],'confirmed'),
        (v_solo_edition,v_solo_copy,v_country[1],'confirmed'),
        (v_solo_edition,null,v_country[1],'confirmed');
  SELECT to_jsonb(r) INTO v_history FROM public.results r
  WHERE show_id=v_solo_show AND country_id=v_country[1];
  IF NOT EXISTS(SELECT 1 FROM public.participants WHERE show_id=v_solo_show AND qualified IS true) THEN
    RAISE EXCEPTION 'Solo semifinal did not initially qualify its active entrant';
  END IF;
  PERFORM set_config('request.jwt.claims',v_claims,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  EXECUTE 'set local role authenticated';
  v_preview := public.studio2_participation_status_change_preview(v_solo_edition,v_country[1],null,'withdrawn');
  v_execution := gen_random_uuid();
  PERFORM public.studio2_apply_participation_status(v_solo_edition,v_country[1],null,'withdrawn',
    v_execution,v_execution::text,(v_preview->>'expectedVersion')::bigint);
  EXECUTE 'reset role';
  IF EXISTS(SELECT 1 FROM public.participants WHERE edition_id=v_solo_edition
    AND country_id=v_country[1] AND qualified IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Last-active withdrawal retained a stale edition qualification';
  END IF;
  IF v_history IS DISTINCT FROM (SELECT to_jsonb(r) FROM public.results r
    WHERE show_id=v_solo_show AND country_id=v_country[1]) THEN
    RAISE EXCEPTION 'Last-active withdrawal altered historical Results evidence';
  END IF;
  IF cardinality(v_failures)>0 THEN RAISE EXCEPTION 'Active snapshot regressions: %',v_failures; END IF;
  RAISE NOTICE 'PASS: active immutable snapshots, history, qualification, anonymous publication and calculation retry';
END
$regression$;
ROLLBACK;
