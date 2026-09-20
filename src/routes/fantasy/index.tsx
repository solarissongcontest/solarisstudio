import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import { useCountries } from "@/lib/data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/fantasy/")({
  head: () => ({
    meta: [
      { title: "Fantasy SSC — Solaris Studio" },
      { name: "description", content: "Build a budget-limited SSC roster and score it from published contest outcomes." },
    ],
  }),
  component: FantasyPage,
});

type FantasyGame = {
  id: string;
  edition_id: string;
  show_id: string;
  name: string;
  opens_at: string;
  locks_at: string;
  status: string;
  roster_size: number;
  budget: number;
  captain_multiplier: number;
  scoring_version: string;
};

type FantasyChoice = {
  game_id: string;
  country_id: string;
  cost: number;
  eligible: boolean;
};

type Team = {
  id: string;
  game_id: string;
  profile_id: string;
  state: string;
  captain_country_id: string | null;
  score: number | null;
};

type Standing = { position: number; displayName: string; score: number; profileId: string };

function FantasyPage() {
  const feature = useQuery({
    queryKey: ["studio2-feature", "fantasy_ssc"],
    queryFn: () => isStudio2FeatureEnabled("fantasy_ssc"),
    staleTime: 30_000,
  });
  const { data: countries = [] } = useCountries();
  const countryMap = useMemo(() => new Map(countries.map((country) => [country.id, country])), [countries]);
  const [gameId, setGameId] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [captain, setCaptain] = useState<string>("");
  const queryClient = useQueryClient();

  const games = useQuery({
    enabled: feature.data === true,
    queryKey: ["fantasy-games"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fantasy_games").select("*").neq("status", "draft").order("locks_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FantasyGame[];
    },
  });
  const activeGame = games.data?.find((game) => game.id === gameId) ?? games.data?.[0] ?? null;

  const choices = useQuery({
    enabled: Boolean(activeGame),
    queryKey: ["fantasy-choices", activeGame?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fantasy_game_entries").select("game_id,country_id,cost,eligible").eq("game_id", activeGame!.id).eq("eligible", true).order("cost", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FantasyChoice[];
    },
  });

  const myTeam = useQuery({
    enabled: Boolean(activeGame),
    queryKey: ["fantasy-my-team", activeGame?.id],
    queryFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return null;
      const { data, error } = await (supabase as any).from("fantasy_teams").select("*").eq("game_id", activeGame!.id).eq("profile_id", user.id).maybeSingle();
      if (error) throw error;
      return data as Team | null;
    },
  });

  const leaderboard = useQuery({
    enabled: Boolean(activeGame),
    queryKey: ["fantasy-leaderboard", activeGame?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fantasy_leaderboard", { _game_id: activeGame!.id });
      if (error) throw error;
      return (data ?? []) as Standing[];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!activeGame) throw new Error("Fantasy game is unavailable.");
      const { error } = await (supabase as any).rpc("submit_fantasy_team", {
        _game_id: activeGame.id,
        _country_ids: selected,
        _captain_country_id: captain || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fantasy-my-team", activeGame?.id] });
    },
  });

  const cost = selected.reduce((sum, id) => sum + (choices.data?.find((choice) => choice.country_id === id)?.cost ?? 0), 0);
  const locked = activeGame ? Date.now() >= Date.parse(activeGame.locks_at) || !["open"].includes(activeGame.status) : true;

  const toggle = (id: string) => {
    if (locked) return;
    setSelected((current) => {
      if (current.includes(id)) {
        if (captain === id) setCaptain("");
        return current.filter((item) => item !== id);
      }
      if (!activeGame || current.length >= activeGame.roster_size) return current;
      return [...current, id];
    });
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Play Solaris"
        title="Fantasy SSC"
        description="Build one constrained roster before the server-side lock. Costs, eligibility, budget and scoring are enforced in the database rather than trusting a browser with a button."
      />

      {feature.isLoading ? (
        <Panel><p className="text-sm text-muted-foreground">Checking Fantasy rollout…</p></Panel>
      ) : feature.data === false ? (
        <Panel title="Fantasy SSC is not enabled yet"><p className="text-sm text-muted-foreground">The product is installed but remains behind its rollout flag until production verification is complete.</p></Panel>
      ) : games.isLoading ? (
        <Panel><p className="text-sm text-muted-foreground">Loading Fantasy games…</p></Panel>
      ) : !activeGame ? (
        <Panel title="No Fantasy game is open"><p className="text-sm text-muted-foreground">An Organizer has not published a Fantasy roster window yet.</p></Panel>
      ) : (
        <>
          {games.data && games.data.length > 1 ? (
            <label className="mb-4 block text-xs font-semibold text-muted-foreground">
              Game
              <select value={activeGame.id} onChange={(event) => { setGameId(event.target.value); setSelected([]); setCaptain(""); }} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground sm:max-w-sm">
                {games.data.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
              </select>
            </label>
          ) : null}

          <Panel title={activeGame.name} description={locked ? "Roster locked" : `Locks ${new Date(activeGame.locks_at).toLocaleString()}`}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Roster" value={`${selected.length}/${activeGame.roster_size}`} />
              <StatTile label="Budget used" value={`${cost}/${activeGame.budget}`} />
              <StatTile label="Scoring" value={activeGame.scoring_version} />
              <StatTile label="Captain bonus" value={`×${activeGame.captain_multiplier}`} />
            </div>
          </Panel>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(choices.data ?? []).map((choice) => {
              const country = countryMap.get(choice.country_id);
              if (!country) return null;
              const checked = selected.includes(choice.country_id);
              return (
                <label key={choice.country_id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${checked ? "border-primary/45 bg-primary/5" : "border-border bg-surface"}`}>
                  <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggle(choice.country_id)} className="size-4" />
                  <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{country.name}</span>
                  <span className="text-xs font-bold tabular-nums">{choice.cost}</span>
                </label>
              );
            })}
          </div>

          <Panel title="Captain" description="Optional. The captain multiplier is applied after the normal v1 score." className="mt-5">
            <select disabled={locked || !selected.length} value={captain} onChange={(event) => setCaptain(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm sm:max-w-sm">
              <option value="">No captain</option>
              {selected.map((id) => <option key={id} value={id}>{countryMap.get(id)?.name ?? id}</option>)}
            </select>
          </Panel>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={locked || submit.isPending || selected.length !== activeGame.roster_size || cost > activeGame.budget}
              onClick={() => submit.mutate()}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {myTeam.data ? "Update roster" : "Save roster"}
            </button>
            {cost > activeGame.budget ? <p className="text-sm text-destructive">Budget exceeded.</p> : null}
            {submit.isError ? <p className="text-sm text-destructive">{submit.error instanceof Error ? submit.error.message : "Roster could not be saved."}</p> : null}
            {myTeam.data ? <p className="text-sm text-muted-foreground">Saved · {myTeam.data.state}{myTeam.data.score != null ? ` · ${myTeam.data.score.toFixed(1)} pts` : ""}</p> : null}
          </div>

          <Panel title="Leaderboard" className="mt-5">
            {leaderboard.data?.length ? (
              <div className="space-y-2">
                {leaderboard.data.slice(0, 25).map((row) => (
                  <div key={row.profileId} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/30 p-3 text-sm">
                    <span className="w-7 tabular-nums text-muted-foreground">{row.position}</span>
                    <span className="flex-1 font-semibold">{row.displayName}</span>
                    <span className="font-bold tabular-nums">{row.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No public scored teams yet.</p>}
          </Panel>

          <Panel title="Scoring v1" className="mt-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Each selected country earns placement points (26 minus final rank, floored at zero), one point per 20 jury points, one point per 20 televote points, and an 8-point qualification bonus when applicable. A captain receives the configured multiplier. Scoring only runs after the relevant result publication gate opens.
            </p>
          </Panel>
        </>
      )}
    </AppShell>
  );
}
