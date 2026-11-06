\set ON_ERROR_STOP on
-- This is run only in the isolated local S14 contest, after publication of the
-- source Televote round and BEFORE official Grand Final Results calculation.
-- All synthetic identities, results and receipts are rolled back atomically.
BEGIN;
SELECT set_config('solaris.s14_test_show_id', :'show_id', true);
SELECT set_config('solaris.s14_test_round_id', :'round_id', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $history$
DECLARE
  v_show uuid := current_setting('solaris.s14_test_show_id')::uuid;
  v_round text := current_setting('solaris.s14_test_round_id');
  v_countries uuid[];
  v_event public.integration_events%rowtype;
  v_event_count integer;
  v_rejected boolean := false;
  v_active uuid;
BEGIN
  SELECT * INTO v_event
  FROM public.integration_events
  WHERE service='televoting' AND event_type='round.results.imported'
    AND remote_id=v_round AND entity_id=v_show AND status='completed'
  ORDER BY completed_at DESC LIMIT 1;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Required completed Televote sync receipt not found';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_countries
  FROM (
    SELECT country.id FROM public.countries country
    WHERE NOT EXISTS (
      SELECT 1 FROM public.participants participant
      WHERE participant.show_id=v_show AND participant.country_id=country.id
    )
    ORDER BY country.id LIMIT 2
  ) unused;
  IF cardinality(v_countries) <> 2 THEN
    RAISE EXCEPTION 'S14 source history regression needs two inactive fixture countries';
  END IF;

  SELECT count(*) INTO v_event_count
  FROM public.integration_events WHERE id=v_event.id;

  -- Add a preserved historical withdrawn Result. The source and the 20
  -- confirmed recipients have not changed, so identical receipt retries pass.
  INSERT INTO public.participants (edition_id,show_id,country_id,participation_status)
  SELECT show_row.edition_id, v_show, v_countries[1], 'withdrawn'
  FROM public.shows show_row WHERE show_row.id=v_show;
  INSERT INTO public.results (edition_id,show_id,country_id,final_rank)
  SELECT show_row.edition_id, v_show, v_countries[1], 77
  FROM public.shows show_row WHERE show_row.id=v_show;

  PERFORM public.v3_record_televote_sync_event(
    'round', v_round, v_show, v_event.payload, v_event.payload_hash, 'completed', null
  );

  IF (SELECT count(*) FROM public.integration_events WHERE id=v_event.id) <> v_event_count THEN
    RAISE EXCEPTION 'Idempotent Televote audit changed an existing completed receipt';
  END IF;

  -- A pending/non-active row is not legitimate historical evidence.
  INSERT INTO public.participants (edition_id,show_id,country_id,participation_status)
  SELECT show_row.edition_id, v_show, v_countries[2], 'pending'
  FROM public.shows show_row WHERE show_row.id=v_show;
  INSERT INTO public.results (edition_id,show_id,country_id,final_rank)
  SELECT show_row.edition_id, v_show, v_countries[2], null
  FROM public.shows show_row WHERE show_row.id=v_show;

  BEGIN
    PERFORM public.v3_record_televote_sync_event(
      'round', v_round, v_show, v_event.payload, v_event.payload_hash, 'completed', null
    );
  EXCEPTION WHEN OTHERS THEN
    IF position('invalid inactive or orphan Results identity' in SQLERRM) > 0 THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Pending Result did not block completed Televote sync audit';
  END IF;

  -- Repair the bad non-active identity, then confirm historical rows
  -- continue to be accepted and the success receipt remains idempotent.
  DELETE FROM public.results WHERE show_id=v_show AND country_id=v_countries[2];
  DELETE FROM public.participants WHERE show_id=v_show AND country_id=v_countries[2];
  PERFORM public.v3_record_televote_sync_event(
    'round', v_round, v_show, v_event.payload, v_event.payload_hash, 'completed', null
  );

  SELECT country_id INTO v_active
  FROM public.participants WHERE show_id=v_show
    AND coalesce(participation_status,'confirmed')='confirmed'
  ORDER BY country_id LIMIT 1;
  DELETE FROM public.results WHERE show_id=v_show AND country_id=v_active;
  v_rejected := false;
  BEGIN
    PERFORM public.v3_record_televote_sync_event(
      'round', v_round, v_show, v_event.payload, v_event.payload_hash, 'completed', null
    );
  EXCEPTION WHEN OTHERS THEN
    IF position('Cannot certify Televote sync:' in SQLERRM) > 0 THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Missing confirmed result did not block sync audit';
  END IF;
  RAISE NOTICE 'PASS: withdrawn history preserves atomic retry receipt; pending and missing active rows fail closed';
END
$history$;
ROLLBACK;
