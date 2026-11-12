import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { FlagChip } from "@/components/FlagChip";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3FantasyScreen } from "@/components/v3/V3FantasyScreen";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { supabase } from "@/integrations/supabase/client";
import { useCountries } from "@/lib/data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import {
  fantasyBoundaryRefreshDelayMs,
  fantasyBudgetUsed,
  restoreV3FantasyRoster,
  type V3FantasyGame,
  type V3FantasyProjection,
  type V3FantasyStanding,
  type V3FantasySubmitResult,
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
  const queryClient = useQueryClient();

  // Discovery remains on the existing publication-gated table policy. Lifecycle
  // state, caller roster and editability come from v3_fantasy_game below.
  const games = useQuery({
    enabled: feature.data === true,
    queryKey: ["fantasy-games"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fantasy_games")
        .select("*")
        .neq("status", "cancelled")
        .order("locks_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as V3FantasyGame[];
    },
    refetchOnWindowFocus: true,
  });
  const activeGameSeed = games.data?.find((game) => game.id === gameId) ?? games.data?.[0] ?? null;

  const fantasyProjection = useQuery({
    enabled: Boolean(activeGameSeed),
    queryKey: ["fantasy-v3-game", activeGameSeed?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("v3_fantasy_game", {
        p_game_id: activeGameSeed!.id,
      });
      if (error) throw error;
      return (data ?? null) as V3FantasyProjection | null;
    },
    refetchOnWindowFocus: true,
  });

  const activeGame = fantasyProjection.data?.game ?? activeGameSeed;
  const choices = fantasyProjection.data?.choices ?? [];
  const myTeam = fantasyProjection.data?.team ?? null;
  const myTeamEntries = fantasyProjection.data?.teamEntries ?? [];

  useEffect(() => {
    if (fantasyProjection.isLoading) return;
    const restored = restoreV3FantasyRoster(myTeam, myTeamEntries);
    setSelected(restored.selected);
    setCaptain(restored.captain);
  }, [activeGameSeed?.id, fantasyProjection.isLoading, myTeam, myTeamEntries]);

  // A one-shot boundary refresh uses serverTime as its clock origin. No polling,
  // and a fast/slow device clock cannot open or extend the roster window.
  useEffect(() => {
    const delay = fantasyBoundaryRefreshDelayMs(fantasyProjection.data);
    if (delay == null || !activeGameSeed) return;
    const timer = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: ["fantasy-v3-game", activeGameSeed.id] });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeGameSeed, fantasyProjection.data, queryClient]);

  const leaderboard = useQuery({
    enabled: Boolean(activeGameSeed),
    queryKey: ["fantasy-leaderboard", activeGameSeed?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fantasy_leaderboard", {
        _game_id: activeGameSeed!.id,
      });
      if (error) throw error;
      return (data ?? []) as V3FantasyStanding[];
    },
  });

  const submit = useMutation({
    mutationFn: async ({ operationId }: { operationId: string }) => {
      if (!activeGameSeed || !fantasyProjection.data) {
        throw new Error("Fantasy game is unavailable.");
      }

      const { data, error } = await (supabase as any).rpc("v3_submit_fantasy_team", {
        p_game_id: activeGameSeed.id,
        p_country_ids: selected,
        p_captain_country_id: captain || null,
        p_expected_revision: fantasyProjection.data.stateVersion,
        p_operation_id: operationId,
        p_idempotency_key: operationId,
        p_correlation_id: operationId,
      });

      if (!error) return data as V3FantasySubmitResult;

      // If the network lost the success response after commit, recover the same
      // canonical operation instead of submitting the roster a second time.
      const { data: reconciled, error: reconcileError } = await (supabase as any).rpc(
        "studio2_reconcile_operation",
        { p_operation_id: operationId },
      );
      const recovery = reconciled as V3FantasySubmitResult | null;
      if (!reconcileError && recovery?.status === "succeeded") return recovery;
      throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fantasy-v3-game", activeGameSeed?.id] }),
        queryClient.invalidateQueries({ queryKey: ["fantasy-games"] }),
      ]);
    },
  });

  const cost = fantasyBudgetUsed(selected, choices);
  const fantasyState = fantasyProjection.data?.effectiveState ?? "unavailable";
  const editable = fantasyProjection.data?.canEdit === true;
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

  const submitRoster = () => {
    if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
      return;
    }
    submit.mutate({ operationId: crypto.randomUUID() });
  };

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return <main className="mx-auto max-w-3xl px-4 py-10"><h1 className="text-3xl font-bold">Fantasy SSC</h1><p role="status" className="mt-3">Opening Fantasy…</p></main>;
  }

  if (v3Enabled) {
    if (games.isLoading || fantasyProjection.isLoading) {
      return (
        <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fantasy">
          <V3Screen><V3Surface className="p-5"><p role="status">Loading Fantasy game…</p></V3Surface></V3Screen>
        </V3AppShell>
      );
    }
    if (games.isError || fantasyProjection.isError) {
      return (
        <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fantasy">
          <V3Screen><V3Surface className="p-5"><h1 className="text-xl font-semibold">Fantasy could not be verified</h1><p className="mt-2 text-sm text-[var(--v3-text-secondary)]">Reload to fetch the latest authoritative roster state.</p></V3Surface></V3Screen>
        </V3AppShell>
      );
    }
    if (!activeGame || !fantasyProjection.data) {
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
          choices={choices}
          countries={countryMap}
          selected={selected}
          captain={captain}
          cost={cost}
          state={fantasyState}
          team={myTeam}
          standings={leaderboard.data ?? []}
          viewerId={rollout.data?.userId ?? null}
          submitting={submit.isPending}
          submitError={submit.isError ? (submit.error instanceof Error ? submit.error.message : "Roster could not be saved.") : null}
          onToggle={toggle}
          onCaptain={setCaptain}
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
      ) : games.isLoading || fantasyProjection.isLoading ? (
        <Panel><p className="text-sm text-muted-foreground">Loading authoritative Fantasy state…</p></Panel>
      ) : games.isError || fantasyProjection.isError ? (
        <Panel title="Fantasy state could not be verified"><p className="text-sm text-muted-foreground">Reload before changing a roster. Solaris will not guess whether the submission window is open.</p></Panel>
      ) : !activeGame || !fantasyProjection.data ? (
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

          <Panel title={activeGame.name} description={windowDescription}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Roster" value={`${selected.length}/${activeGame.roster_size}`} />
              <StatTile label="Budget used" value={`${cost}/${activeGame.budget}`} />
              <StatTile label="Scoring" value={activeGame.scoring_version} />
              <StatTile label="Captain bonus" value={`×${activeGame.captain_multiplier}`} />
            </div>
          </Panel>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {choices.map((choice) => {
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
              onClick={submitRoster}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {myTeam ? "Update roster" : "Save roster"}
            </button>
            {cost > activeGame.budget ? <p className="text-sm text-destructive">Budget exceeded.</p> : null}
            {submit.isError ? <p className="text-sm text-destructive">{submit.error instanceof Error ? submit.error.message : "Roster could not be saved."}</p> : null}
            {myTeam ? <p className="text-sm text-muted-foreground">Saved · {myTeam.state}{myTeam.score != null ? ` · ${myTeam.score.toFixed(1)} pts` : ""}</p> : null}
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
