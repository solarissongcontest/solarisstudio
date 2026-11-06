import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { FlagChip } from "@/components/FlagChip";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3FantasyScreen } from "@/components/v3/V3FantasyScreen";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { supabase } from "@/integrations/supabase/client";
import { useCountries } from "@/lib/data";
import { useFanSession } from "@/lib/prediction-data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import {
  canEditV3FantasyRoster,
  canShowV3FantasyTeamScore,
  fantasyBudgetUsed,
  fantasyRosterReady,
  resolveV3FantasyState,
  restoreV3FantasyRoster,
  shouldRestoreV3FantasyRoster,
  type V3FantasyChoice,
  type V3FantasyGame,
  type V3FantasyStanding,
  type V3FantasyTeam,
  type V3FantasyTeamEntry,
} from "@/lib/v3-fantasy";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/fantasy/")({
  head: () => ({
    meta: [
      { title: "Fantasy SSC — Solaris Studio" },
      { name: "description", content: "Build a budget-limited SSC roster and score it from published contest outcomes." },
    ],
  }),
  component: FantasyPage,
});

function FantasyPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const session = useFanSession();
  const viewerId = session.data?.id ?? null;
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
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
  const [draftScope, setDraftScope] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const queryClient = useQueryClient();

  const selectGame = (nextGameId: string) => {
    setGameId(nextGameId);
    setDraftScope("");
    setDraftDirty(false);
    setSelected([]);
    setCaptain("");
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const games = useQuery({
    enabled: feature.data === true,
    queryKey: ["fantasy-games"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fantasy_games").select("*").neq("status", "cancelled").order("locks_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as V3FantasyGame[];
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const activeGame = games.data?.find((game) => game.id === gameId) ?? games.data?.[0] ?? null;
  const rosterScope = `${viewerId ?? "anonymous"}:${activeGame?.id ?? "none"}`;
  // Read on each render so an old mutation cannot clear a newly scoped draft.
  const latestRosterScope = useRef(rosterScope);
  latestRosterScope.current = rosterScope;
  // State from a prior account or game is never displayed or submitted while
  // the new caller-scoped canonical team is still being resolved.
  const rosterSelected = draftScope === rosterScope ? selected : [];
  const rosterCaptain = draftScope === rosterScope ? captain : "";

  const choices = useQuery({
    enabled: Boolean(activeGame),
    queryKey: ["fantasy-choices", activeGame?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fantasy_game_entries").select("game_id,country_id,cost,eligible").eq("game_id", activeGame!.id).eq("eligible", true).order("cost", { ascending: false });
      if (error) throw error;
      return (data ?? []) as V3FantasyChoice[];
    },
  });

  const myTeam = useQuery({
    enabled: Boolean(activeGame && viewerId),
    queryKey: ["fantasy-my-team", activeGame?.id, viewerId],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !viewerId || auth.user?.id !== viewerId) {
        throw new Error("Fantasy account changed. Refresh your session before continuing.");
      }
      const { data, error } = await (supabase as any).from("fantasy_teams").select("*").eq("game_id", activeGame!.id).eq("profile_id", viewerId).maybeSingle();
      if (error) throw error;
      return data as V3FantasyTeam | null;
    },
    gcTime: 0,
  });

  const myTeamEntries = useQuery({
    enabled: Boolean(viewerId && myTeam.data?.profile_id === viewerId && myTeam.data?.id),
    queryKey: ["fantasy-my-team-entries", viewerId, myTeam.data?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fantasy_team_entries")
        .select("team_id,country_id,cost_locked")
        .eq("team_id", myTeam.data!.id)
        .order("country_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as V3FantasyTeamEntry[];
    },
    gcTime: 0,
  });

  useEffect(() => {
    if (session.isLoading || myTeam.isLoading || myTeamEntries.isLoading || myTeam.isError || myTeamEntries.isError) return;
    // A background refetch must never erase unsaved local changes. A different
    // game/account scope, however, must always restore its own canonical team.
    if (!shouldRestoreV3FantasyRoster({ rosterScope, draftScope, draftDirty })) return;
    const restored = restoreV3FantasyRoster(myTeam.data, myTeamEntries.data);
    setDraftScope(rosterScope);
    setSelected(restored.selected);
    setCaptain(restored.captain);
  }, [rosterScope, draftScope, draftDirty, session.isLoading, myTeam.data, myTeam.isLoading, myTeam.isError, myTeamEntries.data, myTeamEntries.isLoading, myTeamEntries.isError]);

  const leaderboard = useQuery({
    enabled: activeGame?.status === "scored",
    queryKey: ["fantasy-leaderboard", activeGame?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fantasy_leaderboard", { _game_id: activeGame!.id });
      if (error) throw error;
      return (data ?? []) as V3FantasyStanding[];
    },
  });

  const submit = useMutation({
    mutationFn: async (intent: {
      gameId: string;
      viewerId: string;
      scope: string;
      countryIds: string[];
      captainId: string | null;
    }) => {
      // Freeze the submitting scope and payload. A later account/game change
      // must not make an older async callback write or reconcile that new scope.
      if (!activeGame || activeGame.id !== intent.gameId || viewerId !== intent.viewerId || latestRosterScope.current !== intent.scope) {
        throw new Error("Fantasy account or game changed before saving.");
      }
      if (!fantasyRosterReady({ game: activeGame, selected: intent.countryIds, choices: choices.data ?? [] })) {
        throw new Error("Review your roster eligibility, size and budget before saving.");
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || auth.user?.id !== intent.viewerId || latestRosterScope.current !== intent.scope) {
        throw new Error("Fantasy account changed. Sign in again before saving.");
      }
      const { error } = await (supabase as any).rpc("submit_fantasy_team", {
        _game_id: intent.gameId,
        _country_ids: intent.countryIds,
        _captain_country_id: intent.captainId,
      });
      if (error) throw error;
    },
    onSuccess: async (_result, intent) => {
      await queryClient.invalidateQueries({ queryKey: ["fantasy-my-team", intent.gameId, intent.viewerId] });
      await queryClient.invalidateQueries({ queryKey: ["fantasy-my-team-entries", intent.viewerId] });
      // Success for account/game A cannot mark account/game B's unsaved work clean.
      if (latestRosterScope.current === intent.scope) setDraftDirty(false);
    },
  });

  const submitRoster = () => {
    if (!activeGame || !viewerId || submit.isPending) return;
    submit.mutate({
      gameId: activeGame.id,
      viewerId,
      scope: rosterScope,
      countryIds: [...rosterSelected],
      captainId: rosterCaptain || null,
    });
  };

  const cost = fantasyBudgetUsed(rosterSelected, choices.data ?? []);
  const rosterReady = Boolean(
    activeGame && fantasyRosterReady({ game: activeGame, selected: rosterSelected, choices: choices.data ?? [] }),
  );
  const ineligibleSavedCountries = choices.isSuccess && activeGame
    ? rosterSelected.filter((id) => !choices.data?.some((choice) =>
        choice.game_id === activeGame.id && choice.country_id === id && choice.eligible && Number.isFinite(choice.cost) && choice.cost >= 0,
      ))
    : [];
  const loadingError = session.isError || games.isError || choices.isError || myTeam.isError || myTeamEntries.isError;
  const fantasyState = resolveV3FantasyState({ game: activeGame, team: myTeam.data ?? null, nowMs });
  const editable = canEditV3FantasyRoster(fantasyState);
  const locked = !editable;
  const windowDescription = !activeGame
    ? ""
    : fantasyState === "upcoming"
      ? `Opens ${new Date(activeGame.opens_at).toLocaleString()}`
      : locked
        ? "Roster locked"
        : `Locks ${new Date(activeGame.locks_at).toLocaleString()}`;
  const v3Enabled =
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    feature.data === true;

  const toggle = (id: string) => {
    if (locked || submit.isPending) return;
    setDraftScope(rosterScope);
    setDraftDirty(true);
    setSelected((current) => {
      const scoped = draftScope === rosterScope ? current : [];
      if (scoped.includes(id)) {
        if (rosterCaptain === id) setCaptain("");
        return scoped.filter((item) => item !== id);
      }
      if (!activeGame || scoped.length >= activeGame.roster_size) return scoped;
      return [...scoped, id];
    });
  };

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-3xl font-bold">Fantasy SSC</h1><p role="status" className="mt-3">Opening Fantasy…</p></main>;
  }

  if (v3Enabled) {
    if (session.isLoading || games.isLoading || choices.isLoading || myTeam.isLoading || myTeamEntries.isLoading) {
      return (
        <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fantasy">
          <V3Screen><V3Surface className="p-5"><p role="status">Loading Fantasy game…</p></V3Surface></V3Screen>
        </V3AppShell>
      );
    }
    if (loadingError) {
      return (
        <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fantasy">
          <V3Screen><V3Surface className="p-5">
            <h1 className="text-xl font-semibold">Fantasy data could not be loaded</h1>
            <p role="alert" className="mt-2 text-sm text-[var(--v3-text-secondary)]">Your account or Fantasy game could not be verified. No roster changes have been submitted.</p>
            <button type="button" className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-semibold" onClick={() => window.location.reload()}>Retry loading</button>
          </V3Surface></V3Screen>
        </V3AppShell>
      );
    }
    if (!activeGame) {
      return (
        <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fantasy">
          <V3Screen><V3Surface className="p-5"><h1 className="text-xl font-semibold">No Fantasy game is available</h1><p className="mt-2 text-sm text-[var(--v3-text-secondary)]">An Organizer has not published an eligible Fantasy roster window.</p></V3Surface></V3Screen>
        </V3AppShell>
      );
    }
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fantasy">
        <V3FantasyScreen
          game={activeGame}
          games={games.data ?? []}
          onGame={selectGame}
          choices={choices.data ?? []}
          countries={countryMap}
          selected={rosterSelected}
          captain={rosterCaptain}
          dirty={draftScope === rosterScope && draftDirty}
          cost={cost}
          state={fantasyState}
          team={myTeam.data ?? null}
          standings={activeGame.status === "scored" ? (leaderboard.data ?? []) : []}
          viewerId={viewerId}
          submitting={submit.isPending}
          submitError={submit.isError && submit.variables?.scope === rosterScope ? (submit.error instanceof Error ? submit.error.message : "Roster could not be saved.") : null}
          onToggle={toggle}
          onCaptain={(id) => { if (!submit.isPending) { setDraftScope(rosterScope); setDraftDirty(true); setCaptain(id); } }}
          onSubmit={submitRoster}
        />
      </V3AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Play Solaris"
        title="Fantasy SSC"
        description="Build one constrained roster before the server-side lock. Costs, eligibility, budget and scoring are enforced in the database rather than trusting a browser with a button."
      />

      {feature.isLoading ? (
        <Panel><p className="text-sm text-muted-foreground">Checking Fantasy rollout…</p></Panel>
      ) : feature.isError || feature.data !== true ? (
        <Panel title="Fantasy SSC is not enabled yet"><p className="text-sm text-muted-foreground">The product is installed but remains behind its rollout flag until production verification is complete.</p></Panel>
      ) : loadingError ? (
        <Panel title="Fantasy data could not be loaded">
          <p role="alert" className="text-sm text-muted-foreground">Your account or Fantasy game could not be verified. No roster changes have been submitted.</p>
          <button type="button" className="mt-3 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold" onClick={() => window.location.reload()}>Retry loading</button>
        </Panel>
      ) : session.isLoading || games.isLoading || choices.isLoading || myTeam.isLoading || myTeamEntries.isLoading ? (
        <Panel><p role="status" className="text-sm text-muted-foreground">Loading Fantasy game and your saved roster…</p></Panel>
      ) : !activeGame ? (
        <Panel title="No Fantasy game is open"><p className="text-sm text-muted-foreground">An Organizer has not published a Fantasy roster window yet.</p></Panel>
      ) : (
        <>
          {games.data && games.data.length > 1 ? (
            <label className="mb-4 block text-xs font-semibold text-muted-foreground">
              Game
              <select value={activeGame.id} disabled={submit.isPending} onChange={(event) => selectGame(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground sm:max-w-sm">
                {games.data.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
              </select>
            </label>
          ) : null}

          <Panel title={activeGame.name} description={windowDescription}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Roster" value={`${rosterSelected.length}/${activeGame.roster_size}`} />
              <StatTile label="Budget used" value={`${cost}/${activeGame.budget}`} />
              <StatTile label="Scoring" value={activeGame.scoring_version} />
              <StatTile label="Captain bonus" value={`×${activeGame.captain_multiplier}`} />
            </div>
          </Panel>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(choices.data ?? []).map((choice) => {
              const country = countryMap.get(choice.country_id);
              if (!country) return null;
              const checked = rosterSelected.includes(choice.country_id);
              return (
                <label key={choice.country_id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${checked ? "border-primary/45 bg-primary/5" : "border-border bg-surface"}`}>
                  <input type="checkbox" checked={checked} disabled={locked || submit.isPending} onChange={() => toggle(choice.country_id)} className="size-4" />
                  <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{country.name}</span>
                  <span className="text-xs font-bold tabular-nums">{choice.cost}</span>
                </label>
              );
            })}
          </div>

          {ineligibleSavedCountries.length > 0 ? (
            <Panel title="Review your saved roster" className="mt-5">
              <p role="alert" className="text-sm text-destructive">One or more saved countries are no longer eligible. Remove them before saving a revised roster.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ineligibleSavedCountries.map((id) => (
                  <button type="button" key={id} disabled={locked || submit.isPending} onClick={() => toggle(id)} className="min-h-11 rounded-xl border border-destructive px-3 text-sm disabled:opacity-50">
                    Remove {countryMap.get(id)?.name ?? "unavailable country"}
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel title="Captain" description="Optional. The captain multiplier is applied after the normal v1 score." className="mt-5">
            <select disabled={locked || submit.isPending || !rosterSelected.length} value={rosterCaptain} onChange={(event) => { setDraftScope(rosterScope); setDraftDirty(true); setCaptain(event.target.value); }} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm sm:max-w-sm">
              <option value="">No captain</option>
              {rosterSelected.map((id) => <option key={id} value={id}>{countryMap.get(id)?.name ?? id}</option>)}
            </select>
          </Panel>

          {draftScope === rosterScope && draftDirty ? (
            <p role="status" className="mt-3 text-sm font-medium text-muted-foreground">Unsaved roster changes. Only a successful save is official.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={locked || !viewerId || submit.isPending || !rosterReady}
              onClick={submitRoster}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {myTeam.data ? "Update roster" : "Save roster"}
            </button>
            {cost > activeGame.budget ? <p className="text-sm text-destructive">Budget exceeded.</p> : null}
            {submit.isError && submit.variables?.scope === rosterScope ? <p className="text-sm text-destructive">{submit.error instanceof Error ? submit.error.message : "Roster could not be saved."}</p> : null}
            {myTeam.data ? <p className="text-sm text-muted-foreground">Saved · {myTeam.data.state}{canShowV3FantasyTeamScore(activeGame, myTeam.data) ? ` · ${myTeam.data.score!.toFixed(1)} pts` : ""}</p> : null}
          </div>

          <Panel title="Leaderboard" className="mt-5">
            {activeGame.status === "scored" && leaderboard.data?.length ? (
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
