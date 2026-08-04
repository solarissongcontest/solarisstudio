import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContestEntityRow } from "./entities";


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

/**
 * Identity note for every row type below:
 *
 * `country_id` / `receiving_country_id` carry the **canonical contest key**, not
 * necessarily a global country id. Rows are normalised on fetch (see `normalise*`):
 * a global participant keeps its real country id, while a custom participating
 * country falls back to its `contest_entities` id. That keeps one stable key across
 * scoreboards, analytics and broadcast, and custom nations simply never match a real
 * country in global lifetime statistics — which is exactly the intended treatment.
 */
export type Participant = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  contest_entity_id: string | null;
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
  /** Legacy/country-linked voter. Empty string when the ballot comes from a non-country jury. */
  voter_country_id: string;
  voter_id?: string | null;
  voter_entity_id?: string | null;

  receiving_country_id: string;
  receiving_entity_id?: string | null;
  points: number;
};



export const VOTER_KINDS = ["country", "external-country", "organization", "person", "custom"] as const;
export type VoterKind = (typeof VOTER_KINDS)[number];

export type Voter = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string | null;
  /** Set when this jury *is* a participating entity, which drives self-vote prevention. */
  contest_entity_id?: string | null;
  name: string;
  kind: VoterKind;
  flag_image: string | null;
  accent_color: string;
  sort_order: number;
  created_at: string;
};


/** A normalised voting-entity option, whether backed by `voters` or a plain participating country. */
export type VoterOption = {
  key: string; // "v:<voterId>" or "c:<countryId>"
  voterId: string | null;
  countryId: string | null;
  name: string;
  short_code: string | null;
  flag_image: string | null;
  accent_color: string;
};

export function voterKey(v: { voterId?: string | null; countryId?: string | null }) {
  return v.voterId ? `v:${v.voterId}` : `c:${v.countryId}`;
}

export function voterOptionsFromVoters(voters: Voter[], countries: Country[]): VoterOption[] {
  const cMap = new Map(countries.map((c) => [c.id, c]));
  return voters.map((v) => {
    const c = v.country_id ? cMap.get(v.country_id) : undefined;
    return {
      key: `v:${v.id}`,
      voterId: v.id,
      countryId: v.country_id,
      name: v.name || c?.name || "Voter",
      short_code: c?.short_code ?? null,
      flag_image: v.flag_image ?? c?.flag_image ?? null,
      accent_color: v.accent_color || c?.accent_color || "#8888aa",
    };
  });
}

export function voterOptionsFromCountries(countryIds: string[], countries: Country[]): VoterOption[] {
  const cMap = new Map(countries.map((c) => [c.id, c]));
  return countryIds
    .map((id) => cMap.get(id))
    .filter((c): c is Country => !!c)
    .map((c) => ({
      key: `c:${c.id}`,
      voterId: null,
      countryId: c.id,
      name: c.name,
      short_code: c.short_code,
      flag_image: c.flag_image,
      accent_color: c.accent_color,
    }));
}

/** Voting entities for a show: custom voters if any exist, else participating countries. */
export function resolveShowVoters(
  voters: Voter[] | undefined,
  participantCountryIds: string[],
  countries: Country[],
): VoterOption[] {
  if (voters && voters.length) return voterOptionsFromVoters(voters, countries);
  return voterOptionsFromCountries(participantCountryIds, countries);
}

export type Televote = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  contest_entity_id?: string | null;
  points: number;
};

export type ResultRow = {
  id: string;
  edition_id: string;
  show_id: string | null;
  country_id: string;
  contest_entity_id?: string | null;
  jury_points: number;
  televote_points: number;
  total_points: number;
  final_rank: number | null;
};

/* ---------------- fetch helpers ---------------- */

/**
 * Collapse the two identity columns into the canonical contest key.
 * Global rows keep their real country id; custom participating countries surface
 * their `contest_entities` id, so downstream code needs a single lookup only.
 */
function canonicalise(table: string, row: any) {
  if (!row) return row;
  if (table === "jury_votes") {
    return { ...row, receiving_country_id: row.receiving_country_id ?? row.receiving_entity_id ?? "" };
  }
  if (table === "participants" || table === "televote_votes" || table === "results") {
    return { ...row, country_id: row.country_id ?? row.contest_entity_id ?? "" };
  }
  return row;
}

async function all<T>(table: string, apply?: (q: any) => any): Promise<T[]> {
  let q: any = (supabase as any).from(table).select("*");
  if (apply) q = apply(q);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => canonicalise(table, r)) as T[];
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

/** Participating nations of one edition — global links and edition-only custom countries. */
export function useContestEntities(editionId?: string) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["contest_entities", "edition", editionId],
    queryFn: () =>
      all<ContestEntityRow>("contest_entities", (q) => q.eq("edition_id", editionId).order("display_name")),
  });
}

/** Every contest entity, for cross-edition views such as broadcast and statistics. */
export function useAllContestEntities() {
  return useQuery({
    queryKey: ["contest_entities", "all"],
    queryFn: () => all<ContestEntityRow>("contest_entities"),
    staleTime: 60 * 1000,
  });
}

export function useVoters(editionId?: string) {

  return useQuery({
    enabled: !!editionId,
    queryKey: ["voters", "edition", editionId],
    queryFn: () => all<Voter>("voters", (q) => q.eq("edition_id", editionId).order("sort_order")),
  });
}

export function useShowVoters(showId?: string) {
  return useQuery({
    enabled: !!showId,
    queryKey: ["voters", "show", showId],
    queryFn: () => all<Voter>("voters", (q) => q.eq("show_id", showId).order("sort_order")),
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

/** Every participant row across every edition — needed by the analytics layer. */
export function useAllParticipants() {
  return useQuery({
    queryKey: ["participants", "all"],
    queryFn: () => all<Participant>("participants"),
    staleTime: 60 * 1000,
  });
}

/** Every voting entity across every edition. */
export function useAllVoters() {
  return useQuery({ queryKey: ["voters", "all"], queryFn: () => all<Voter>("voters") });
}

/**
 * Resolve which voting entity a stored ballot belongs to, tolerating history:
 * ballots entered before custom juries existed carry only `voter_country_id`,
 * so they are matched to the jury representing that country when one exists.
 */
export function matchVoterKey(
  vote: { voter_id?: string | null; voter_country_id?: string | null },
  options: VoterOption[],
): string {
  if (vote.voter_id) {
    const direct = options.find((o) => o.voterId === vote.voter_id);
    if (direct) return direct.key;
  }
  if (vote.voter_country_id) {
    const byCountry = options.find((o) => o.countryId === vote.voter_country_id);
    if (byCountry) return byCountry.key;
    return `c:${vote.voter_country_id}`;
  }
  return vote.voter_id ? `v:${vote.voter_id}` : "";
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
