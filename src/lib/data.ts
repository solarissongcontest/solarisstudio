import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ---------------- types ---------------- */

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

export type Theme = {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  is_public: boolean;
};

export type Edition = {
  id: string;
  edition_number: number | null;
  name: string;
  year: number | null;
  slug: string;
  description: string | null;
  host_country_id: string | null;
  host_city: string | null;
  logo: string | null;
  theme_id: string | null;
  status: string;
  published: boolean;
};

export type Show = {
  id: string;
  edition_id: string;
  name: string;
  kind: string;
  sort_order: number;
  published: boolean;
  status: string;
  qualifier_count: number | null;
  theme_id: string | null;
  voting_config: Record<string, unknown> | null;
  broadcast_config: Record<string, unknown> | null;
};

export const SHOW_KINDS = ["semi-final", "grand-final", "special", "other"] as const;

export type Participant = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  artist: string | null;
  song: string | null;
  running_order: number | null;
  semi_final: string;
  qualified: boolean | null;
  notes: string | null;
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

/* ---------------- fetch helpers ---------------- */

async function all<T>(table: string, apply?: (q: any) => any): Promise<T[]> {
  let q: any = (supabase as any).from(table).select("*");
  if (apply) q = apply(q);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/* ---------------- queries ---------------- */

export function useCountries() {
  return useQuery({
    queryKey: ["countries"],
    queryFn: () => all<Country>("countries", (q) => q.order("name")),
    staleTime: 5 * 60 * 1000,
  });
}

export function useThemes() {
  return useQuery({ queryKey: ["themes"], queryFn: () => all<Theme>("themes", (q) => q.order("name")) });
}

export function useEditions() {
  return useQuery({
    queryKey: ["editions"],
    queryFn: () =>
      all<Edition>("editions", (q) =>
        q.order("edition_number", { ascending: false, nullsFirst: false }),
      ),
  });
}

export function useEdition(slug: string) {
  return useQuery({
    queryKey: ["edition", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("editions").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return (data as Edition) ?? null;
    },
  });
}

export function useShows(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["shows", editionId],
    queryFn: () => all<Show>("shows", (q) => q.eq("edition_id", editionId).order("sort_order")),
  });
}

export function useAllShows() {
  return useQuery({ queryKey: ["shows", "all"], queryFn: () => all<Show>("shows") });
}

export function useShow(showId?: string) {
  return useQuery({
    enabled: !!showId,
    queryKey: ["show", showId],
    queryFn: async () => {
      const { data, error } = await supabase.from("shows").select("*").eq("id", showId!).maybeSingle();
      if (error) throw error;
      return (data as Show) ?? null;
    },
  });
}

export function useParticipants(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["participants", editionId],
    queryFn: () =>
      all<Participant>("participants", (q) =>
        q.eq("edition_id", editionId).order("running_order", { nullsFirst: false }),
      ),
  });
}

export function useShowParticipants(showId?: string) {
  return useQuery({
    enabled: !!showId,
    queryKey: ["participants", "show", showId],
    queryFn: () =>
      all<Participant>("participants", (q) =>
        q.eq("show_id", showId).order("running_order", { nullsFirst: false }),
      ),
  });
}

export function useJuryVotes(showId?: string) {
  return useQuery({
    enabled: !!showId,
    queryKey: ["jury_votes", "show", showId],
    queryFn: () => all<JuryVote>("jury_votes", (q) => q.eq("show_id", showId)),
  });
}

export function useTelevotes(showId?: string) {
  return useQuery({
    enabled: !!showId,
    queryKey: ["televote_votes", "show", showId],
    queryFn: () => all<Televote>("televote_votes", (q) => q.eq("show_id", showId)),
  });
}

export function useAllJuryVotes() {
  return useQuery({ queryKey: ["jury_votes", "all"], queryFn: () => all<JuryVote>("jury_votes") });
}

export function useAllTelevotes() {
  return useQuery({
    queryKey: ["televote_votes", "all"],
    queryFn: () => all<Televote>("televote_votes"),
  });
}

export function useResults(showId?: string) {
  return useQuery({
    enabled: !!showId,
    queryKey: ["results", "show", showId],
    queryFn: () => all<ResultRow>("results", (q) => q.eq("show_id", showId)),
  });
}

export function useAllResults() {
  return useQuery({ queryKey: ["results", "all"], queryFn: () => all<ResultRow>("results") });
}

export function useIsOrganizer() {
  return useQuery({
    queryKey: ["is-organizer"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "organizer")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
}

/* ---------------- mutations ---------------- */

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) =>
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useTableMutation(table: string, invalidateKeys: string[]) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (op: {
      action: "insert" | "update" | "delete" | "upsert";
      values?: any;
      id?: string;
      match?: Record<string, any>;
      onConflict?: string;
    }) => {
      const t: any = (supabase as any).from(table);
      let res: any;
      if (op.action === "insert") res = await t.insert(op.values).select();
      else if (op.action === "upsert")
        res = await t.upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined).select();
      else if (op.action === "update") {
        let q = t.update(op.values);
        if (op.id) q = q.eq("id", op.id);
        Object.entries(op.match ?? {}).forEach(([k, v]) => (q = q.eq(k, v)));
        res = await q.select();
      } else {
        let q = t.delete();
        if (op.id) q = q.eq("id", op.id);
        Object.entries(op.match ?? {}).forEach(([k, v]) => (q = q.eq(k, v)));
        res = await q;
      }
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => invalidate(...invalidateKeys),
  });
}

export function byId<T extends { id: string }>(rows: T[] | undefined) {
  const map = new Map<string, T>();
  (rows ?? []).forEach((r) => map.set(r.id, r));
  return map;
}

export const editionLabel = (e: Edition) =>
  e.edition_number ? `SSC ${e.edition_number}` : e.name;

export const POINT_SET = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];
