\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  v_edition uuid := gen_random_uuid();
  v_show uuid := gen_random_uuid();
  v_a uuid := '14000000-0000-4000-8000-000000000004';
  v_b uuid := '14000000-0000-4000-8000-000000000005';
BEGIN
  IF (SELECT count(*) FROM public.countries
      WHERE id IN (v_a, v_b)) <> 2 THEN
    RAISE EXCEPTION 'Qualification regression countries missing';
  END IF;

  INSERT INTO public.editions (id, name, slug)
  VALUES (
    v_edition,
    'S14 qualification regression',
    's14-qualification-' || replace(v_edition::text, '-', '')
  );

  INSERT INTO public.shows
    (id, edition_id, name, kind, qualifier_count, voting_config)
  VALUES (
    v_show, v_edition, 'Regression semi-final', 'semi-final',
    2, '{"qualifiers":2}'::jsonb
  );

  INSERT INTO public.participants (edition_id, show_id, country_id)
  VALUES
    (v_edition, v_show, v_a),
    (v_edition, v_show, v_b);

  INSERT INTO public.results
    (edition_id, show_id, country_id, final_rank)
  SELECT v_edition, v_show, p.country_id, NULL
  FROM public.participants p
  WHERE p.show_id = v_show
    AND NOT EXISTS (
      SELECT 1 FROM public.results r
      WHERE r.show_id = v_show AND r.country_id = p.country_id
    );

  UPDATE public.results
  SET final_rank = NULL
  WHERE show_id = v_show;

  UPDATE public.participants
  SET qualified = NULL
  WHERE show_id = v_show;

  PERFORM public.refresh_edition_qualifications(v_edition);

  IF (SELECT count(*) FROM public.participants
      WHERE show_id = v_show AND qualified IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Undecided qualification was not preserved';
  END IF;

  RAISE NOTICE 'PASS: undecided qualification preserved';

  UPDATE public.results
  SET final_rank = CASE WHEN country_id = v_a THEN 1 ELSE 2 END
  WHERE show_id = v_show;

  PERFORM public.refresh_edition_qualifications(v_edition);

  IF (SELECT count(*) FROM public.participants
      WHERE show_id = v_show AND qualified IS TRUE) <> 2 THEN
    RAISE EXCEPTION 'Ranked qualification projection failed';
  END IF;

  RAISE NOTICE 'PASS: ranked qualifiers projected';

  UPDATE public.results
  SET final_rank = NULL
  WHERE show_id = v_show AND country_id = v_a;

  UPDATE public.participants
  SET qualified = TRUE
  WHERE show_id = v_show AND country_id = v_a;

  PERFORM public.refresh_edition_qualifications(v_edition);

  IF NOT EXISTS (
    SELECT 1 FROM public.participants
    WHERE show_id = v_show AND country_id = v_a
      AND qualified IS FALSE
  ) THEN
    RAISE EXCEPTION 'Stale qualification was not cleared';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.participants
    WHERE show_id = v_show AND country_id = v_b
      AND qualified IS TRUE
  ) THEN
    RAISE EXCEPTION 'Valid qualifier was not preserved';
  END IF;

  RAISE NOTICE 'PASS: stale qualifier cleared';
  RAISE NOTICE 'PASS: valid qualifier preserved';
END
$test$;

ROLLBACK;
