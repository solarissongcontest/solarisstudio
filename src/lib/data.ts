import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Country = {
  id: string;
  name: string;
  native_name: string | null;
  short_code: string;
  flag_image: string | null;
  region: string;
  accent_color: string;
  description: string | null;
  first_participation: number | null;
};

export type Edition = {
  id: string;
  name: string;
  year: number;
  slug: string;
  host_country_id: string | null;
  host_city: string | null;
  logo: string | null;
  theme_colors: Record<string, string> | null;
  status: string;
  published: boolean;
  jury_weight: number;
};

export type Show = {
  id: string;
  edition_id: string;
  name: string;
  kind: string;
  sort_order: number;
  published: boolean;
};

export const SHOW_KINDS = ["semi-final", "grand-final", "other"] as const;

export type Participant = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  artist: string;
  song: string;
  running_order: number | null;
  semi_final: string;
};

export type JuryVote = {
  id: string;
  edition_id: string;
  show_id: string | null;
  voter_country_id: string;
  receiving_country_id: string;
  points: number;
};

export type Televote = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  points: number;
};

export type ResultRow = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  jury_points: number;
  televote_points: number;
  total_points: number;
  final_rank: number | null;
};


export const POINT_SET = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

async function all<T>(table: string, apply?: (q: any) => any): Promise<T[]> {
  let q: any = (supabase as any).from(table).select("*");
  if (apply) q = apply(q);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useCountries() {
  return useQuery({
    queryKey: ["countries"],
    queryFn: () => all<Country>("countries", (q) => q.order("name")),
  });
}

export function useEditions() {
  return useQuery({
    queryKey: ["editions"],
    queryFn: () => all<Edition>("editions", (q) => q.order("year", { ascending: false })),
  });
}

export function useEdition(slug: string) {
  return useQuery({
    queryKey: ["edition", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("editions")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data as Edition | null;
    },
  });
}

export function useShows(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["shows", editionId],
    queryFn: () =>
      all<Show>("shows", (q) => q.eq("edition_id", editionId).order("sort_order")),
  });
}


export function useParticipants(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["participants", editionId],
    queryFn: () =>
      all<Participant>("participants", (q) =>
        q.eq("edition_id", editionId).order("running_order"),
      ),
  });
}

export function useJuryVotes(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["jury_votes", editionId],
    queryFn: () => all<JuryVote>("jury_votes", (q) => q.eq("edition_id", editionId)),
  });
}

export function useAllJuryVotes() {
  return useQuery({ queryKey: ["jury_votes", "all"], queryFn: () => all<JuryVote>("jury_votes") });
}

export function useTelevotes(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["televote_votes", editionId],
    queryFn: () => all<Televote>("televote_votes", (q) => q.eq("edition_id", editionId)),
  });
}

export function useAllTelevotes() {
  return useQuery({
    queryKey: ["televote_votes", "all"],
    queryFn: () => all<Televote>("televote_votes"),
  });
}

export function useResults(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["results", editionId],
    queryFn: () => all<ResultRow>("results", (q) => q.eq("edition_id", editionId)),
  });
}

export function useAllResults() {
  return useQuery({ queryKey: ["results", "all"], queryFn: () => all<ResultRow>("results") });
}

export function byId<T extends { id: string }>(rows: T[] | undefined) {
  const map = new Map<string, T>();
  (rows ?? []).forEach((r) => map.set(r.id, r));
  return map;
}
