CREATE OR REPLACE FUNCTION public.publish_show_results(p_show_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edition_id uuid;
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'organizer'::public.app_role) THEN
    RAISE EXCEPTION 'Only organizers can publish results.' USING ERRCODE = '42501';
  END IF;

  SELECT edition_id INTO v_edition_id FROM public.shows WHERE id = p_show_id;
  IF v_edition_id IS NULL THEN
    RAISE EXCEPTION 'Show not found.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.results WHERE show_id = p_show_id;

  INSERT INTO public.results (edition_id, show_id, country_id, jury_points, televote_points, total_points, final_rank)
  SELECT v_edition_id,
         p_show_id,
         (r->>'country_id')::uuid,
         COALESCE((r->>'jury_points')::int, 0),
         COALESCE((r->>'televote_points')::int, 0),
         COALESCE((r->>'total_points')::int, 0),
         NULLIF(r->>'final_rank', '')::int
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publish_show_results(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_show_results(uuid, jsonb) TO authenticated;