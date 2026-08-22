import { useQuery } from "@tanstack/react-query";

import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as any;

export type PublicNationalFinalEntry = {
  id: string;
  artist: string | null;
  song_title: string | null;
  song_url: string | null;
  position: number | null;
  result_position: number | null;
  winner: boolean;
  next_in_line: boolean;
};

export type PublicNationalFinal = {
  id: string;
  name: string;
  expected_entry_count: number | null;
  winning_entry_id: string | null;
  edition_id: string | null;
  edition_number: number | null;
  edition_name: string | null;
  edition_slug: string | null;
  nf_date: string | null;
  result_date: string | null;
  lineup_published: boolean;
  results_published: boolean;
  source?: string;
  entries: PublicNationalFinalEntry[];
};

export function useCountryNationalFinals(countryId?: string) {
  return useQuery({
    enabled: Boolean(countryId),
    queryKey: ["country-national-finals", countryId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_country_national_finals", {
        _country_id: countryId!,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as PublicNationalFinal[];
    },
    staleTime: 30_000,
  });
}
