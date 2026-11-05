\set ON_ERROR_STOP on
-- Executed exclusively against the isolated S14 Supabase fixture.
-- Every synthetic participant, vote and result is rolled back.
BEGIN;
DO $regression$
DECLARE
  v_edition uuid := gen_random_uuid();
  v_show uuid := gen_random_uuid();
  v_ids uuid[];
  v_reconciled jsonb;
  v_one uuid;
  v_two uuid;
  v_historical uuid;
  v_pending uuid;
  v_orphan uuid;
  v_rank_one integer;
  v_rank_two integer;
BEGIN
  SELECT array_agg(id ORDER BY id) INTO v_ids
  FROM (SELECT id FROM public.countries ORDER BY id LIMIT 5) countries;
  IF cardinality(v_ids) <> 5 THEN
    RAISE EXCEPTION 'Results regression requires five local fixture countries';
  END IF;
  v_one := v_ids[1];
  v_two := v_ids[2];
  v_historical := v_ids[3];
  v_pending := v_ids[4];
  v_orphan := v_ids[5];

  INSERT INTO public.editions (id, name, slug)
  VALUES (v_edition, 'S14 Results isolated identity regression',
          's14-results-' || replace(v_edition::text, '-', ''));
  INSERT INTO public.shows (id, edition_id, name, kind, voting_config)
  VALUES (v_show, v_edition, 'S14 synthetic result integrity', 'semi-final',
          '{"juryPoints":[12,10,8,7,6,5,4,3,2,1],"tieBreak":["televote","countback","jury"]}'::jsonb);

  INSERT INTO public.participants (edition_id, show_id, country_id, participation_status)
  VALUES (v_edition, v_show, v_one, 'confirmed'),
         (v_edition, v_show, v_two, 'confirmed'),
         (v_edition, v_show, v_historical, 'withdrawn'),
         (v_edition, v_show, v_pending, 'pending');

  INSERT INTO public.televote_votes (edition_id, show_id, country_id, points)
  VALUES (v_edition, v_show, v_one, 12),
         (v_edition, v_show, v_two, 8);

  PERFORM public.sync_show_results_from_votes(v_show);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Valid active Results not consistent: %', v_reconciled;
  END IF;

  -- Historical withdrawn/disqualified identities are preserved, not active.
  INSERT INTO public.results (edition_id, show_id, country_id, final_rank)
  VALUES (v_edition, v_show, v_historical, 77);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'historicalInactiveResultRowCount')::integer <> 1
     OR (SELECT final_rank FROM public.results WHERE show_id=v_show AND country_id=v_historical) <> 77
     OR (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Withdrawn historical row wrongly blocked readiness: %', v_reconciled;
  END IF;
  UPDATE public.participants SET participation_status='disqualified'
  WHERE show_id=v_show AND country_id=v_historical;
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'historicalInactiveResultRowCount')::integer <> 1
     OR (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Disqualified history wrongly blocked readiness: %', v_reconciled;
  END IF;

  -- Non-active pending rows, unlike genuine archive evidence, are invalid.
  INSERT INTO public.results (edition_id, show_id, country_id, final_rank)
  VALUES (v_edition, v_show, v_pending, null);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'invalidNonactiveResultRowCount')::integer <> 1
     OR (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Pending result escaped canonical reconciliation: %', v_reconciled;
  END IF;
  DELETE FROM public.results WHERE show_id=v_show AND country_id=v_pending;

  -- Two valid but swapped in-range unique ranks are still incorrect.
  SELECT final_rank INTO v_rank_one FROM public.results WHERE show_id=v_show AND country_id=v_one;
  SELECT final_rank INTO v_rank_two FROM public.results WHERE show_id=v_show AND country_id=v_two;
  IF v_rank_one IS NULL OR v_rank_two IS NULL OR v_rank_one=v_rank_two THEN
    RAISE EXCEPTION 'Synthetic ranks were not initialized distinctly';
  END IF;
  UPDATE public.results SET final_rank =
    CASE WHEN country_id=v_one THEN v_rank_two
         WHEN country_id=v_two THEN v_rank_one
         ELSE final_rank END
  WHERE show_id=v_show AND country_id IN (v_one,v_two);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'incorrectCanonicalRankCount')::integer <> 2
     OR (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Swapped official rankings evaded reconciliation: %', v_reconciled;
  END IF;
  PERFORM public.sync_show_results_from_votes(v_show);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Authoritative scoring did not repair wrong ranks: %', v_reconciled;
  END IF;

  -- Orphans and missing active identities must fail; canonical replay recovers.
  INSERT INTO public.results (edition_id, show_id, country_id)
  VALUES (v_edition, v_show, v_orphan);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'orphanResultRowCount')::integer <> 1
     OR (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Orphan Results row evaded reconciliation: %', v_reconciled;
  END IF;
  DELETE FROM public.results WHERE show_id=v_show AND country_id=v_orphan;
  DELETE FROM public.results WHERE show_id=v_show AND country_id=v_two;
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'missingResultRowCount')::integer <> 1
     OR (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Missing active Results identity evaded reconciliation: %', v_reconciled;
  END IF;
  PERFORM public.sync_show_results_from_votes(v_show);
  v_reconciled := private.studio2_result_reconciliation(v_show);
  IF (v_reconciled->>'reconciliationConsistent')::boolean IS DISTINCT FROM true
     OR (SELECT count(*) FROM public.results WHERE show_id=v_show) <> 3
     OR (SELECT final_rank FROM public.results WHERE show_id=v_show AND country_id=v_historical) <> 77 THEN
    RAISE EXCEPTION 'Canonical recovery damaged history or failed: %', v_reconciled;
  END IF;
  RAISE NOTICE 'PASS: active history, invalid pending, canonical rank, orphan and retry recovery';
END
$regression$;
ROLLBACK;
