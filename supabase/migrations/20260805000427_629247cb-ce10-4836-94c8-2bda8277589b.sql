CREATE OR REPLACE FUNCTION public.assert_entity_edition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_id uuid;
  v_ed uuid;
BEGIN
  IF TG_TABLE_NAME = 'jury_votes' THEN
    v_ids := ARRAY[NEW.receiving_entity_id, NEW.voter_entity_id];
  ELSE
    v_ids := ARRAY[NEW.contest_entity_id];
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    IF v_id IS NOT NULL THEN
      SELECT e.edition_id INTO v_ed FROM public.contest_entities e WHERE e.id = v_id;
      IF v_ed IS NOT NULL AND v_ed <> NEW.edition_id THEN
        RAISE EXCEPTION 'Contest entity belongs to a different edition.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;