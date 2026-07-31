ALTER TABLE public.participants DROP CONSTRAINT IF EXISTS participants_edition_id_country_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS participants_show_country_key ON public.participants (show_id, country_id) WHERE show_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS participants_edition_country_noshow_key ON public.participants (edition_id, country_id) WHERE show_id IS NULL;