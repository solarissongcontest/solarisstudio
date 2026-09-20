import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { useCountries, useParticipants, useShows } from "@/lib/data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/_authenticated/admin/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy SSC — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FantasyAdminPage,
});

type ExistingGame = {
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
};

function FantasyAdminPage() {
  const { editionId } = useAdminContext();
  const { data: countries = [] } = useCountries();
  const { data: shows = [] } = useShows(editionId ?? undefined);
  const { data: participants = [] } = useParticipants(editionId ?? undefined);
  const queryClient = useQueryClient();

  const feature = useQuery({
    queryKey: ["studio2-feature", "fantasy_ssc", editionId ?? "none"],
    queryFn: () => isStudio2FeatureEnabled("fantasy_ssc", editionId),
    staleTime: 30_000,
  });

  const existing = useQuery({
    enabled: Boolean(editionId),
    queryKey: ["fantasy-admin-game", editionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fantasy_games")
        .select("*")
        .eq("edition_id", editionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ExistingGame | null;
    },
  });

  const choices = useQuery({
    enabled: Boolean(existing.data?.id),
    queryKey: ["fantasy-admin-choices", existing.data?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fantasy_game_entries")
        .select("country_id,cost,eligible")
        .eq("game_id", existing.data!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ country_id: string; cost: number; eligible: boolean }>;
    },
  });

  const [showId, setShowId] = useState("");
  const [name, setName] = useState("Fantasy SSC");
  const [opensAt, setOpensAt] = useState("");
  const [locksAt, setLocksAt] = useState("");
  const [rosterSize, setRosterSize] = useState(5);
  const [budget, setBudget] = useState(50);
  const [captainMultiplier, setCaptainMultiplier] = useState(2);
  const [costs, setCosts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!existing.data) return;
    setShowId(existing.data.show_id);
    setName(existing.data.name);
    setOpensAt(toLocal(existing.data.opens_at));
    setLocksAt(toLocal(existing.data.locks_at));
    setRosterSize(existing.data.roster_size);
    setBudget(Number(existing.data.budget));
    setCaptainMultiplier(Number(existing.data.captain_multiplier));
  }, [existing.data]);

  const selectedShowId = showId || shows[0]?.id || "";
  const showParticipants = useMemo(
    () => participants.filter((participant) => participant.show_id === selectedShowId),
    [participants, selectedShowId],
  );

  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const participant of showParticipants) {
      const saved = choices.data?.find((row) => row.country_id === participant.country_id)?.cost;
      initial[participant.country_id] = saved ?? 10;
    }
    setCosts((current) => ({ ...initial, ...Object.fromEntries(Object.entries(current).filter(([id]) => showParticipants.some((row) => row.country_id === id))) }));
  }, [choices.data, showParticipants]);

  const countryMap = useMemo(() => new Map(countries.map((country) => [country.id, country])), [countries]);

  const save = useMutation({
    mutationFn: async () => {
      if (!editionId || !selectedShowId || !opensAt || !locksAt) throw new Error("Complete the game window first.");
      const entries = showParticipants.map((participant) => ({
        countryId: participant.country_id,
        cost: Number(costs[participant.country_id] ?? 10),
        eligible: true,
      }));
      const { error } = await (supabase as any).rpc("studio2_save_fantasy_game", {
        _game_id: existing.data?.id ?? null,
        _edition_id: editionId,
        _show_id: selectedShowId,
        _name: name.trim(),
        _opens_at: new Date(opensAt).toISOString(),
        _locks_at: new Date(locksAt).toISOString(),
        _roster_size: rosterSize,
        _budget: budget,
        _captain_multiplier: captainMultiplier,
        _entries: entries,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fantasy-admin-game", editionId] });
      await queryClient.invalidateQueries({ queryKey: ["fantasy-admin-choices"] });
    },
  });

  const score = useMutation({
    mutationFn: async () => {
      if (!existing.data?.id) throw new Error("Save the game first.");
      const { data, error } = await (supabase as any).rpc("score_fantasy_game", { _game_id: existing.data.id });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fantasy-admin-game", editionId] });
    },
  });

  if (!editionId) {
    return <AdminPage><AdminEmptyState icon={Trophy} title="Select an edition" description="Fantasy SSC configuration is edition-scoped." /></AdminPage>;
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Engagement"
          title="Fantasy SSC"
          description="Configure the one clear production ruleset: fixed roster, deterministic entry costs, budget, optional captain multiplier, server-time lock and published-result scoring."
        />

        <AdminCard>
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatus tone={feature.data ? "ready" : "attention"}>{feature.data ? "Rollout enabled for this Organizer" : "Rollout flag off"}</AdminStatus>
            {existing.data ? <AdminStatus tone="info">{existing.data.status}</AdminStatus> : <AdminStatus tone="neutral">Not configured</AdminStatus>}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Configuration can be prepared while the public rollout stays disabled. The public page still obeys the feature flag, because apparently shipping half-configured games to everyone would be frowned upon.
          </p>
        </AdminCard>

        <AdminCard strong>
          <AdminCardHeader eyebrow="Game window" title="Rules and lock" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} className="admin-input" /></Field>
            <Field label="Show">
              <select value={selectedShowId} onChange={(event) => setShowId(event.target.value)} className="admin-input">
                {shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
              </select>
            </Field>
            <Field label="Roster size"><input type="number" min={2} max={15} value={rosterSize} onChange={(event) => setRosterSize(Number(event.target.value))} className="admin-input" /></Field>
            <Field label="Budget"><input type="number" min={1} step="0.5" value={budget} onChange={(event) => setBudget(Number(event.target.value))} className="admin-input" /></Field>
            <Field label="Captain multiplier"><input type="number" min={1} max={5} step="0.25" value={captainMultiplier} onChange={(event) => setCaptainMultiplier(Number(event.target.value))} className="admin-input" /></Field>
            <div />
            <Field label="Opens"><input type="datetime-local" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className="admin-input" /></Field>
            <Field label="Locks"><input type="datetime-local" value={locksAt} onChange={(event) => setLocksAt(event.target.value)} className="admin-input" /></Field>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader eyebrow="Roster market" title="Entry costs" description="Every eligible show participant receives an explicit locked cost." />
          {showParticipants.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {showParticipants.map((participant) => {
                const country = countryMap.get(participant.country_id);
                return (
                  <label key={participant.country_id} className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{country?.name ?? participant.country_id}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{participant.artist ?? "Artist not published"} · {participant.song ?? "Song not published"}</span>
                    </span>
                    <input
                      type="number"
                      min={0.5}
                      step="0.5"
                      value={costs[participant.country_id] ?? 10}
                      onChange={(event) => setCosts((current) => ({ ...current, [participant.country_id]: Number(event.target.value) }))}
                      className="admin-input text-right"
                      aria-label={`Fantasy cost for ${country?.name ?? participant.country_id}`}
                    />
                  </label>
                );
              })}
            </div>
          ) : <AdminEmptyState title="No participants for this show" description="Select a show with participant rows before configuring Fantasy SSC." />}
        </AdminCard>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !showParticipants.length}
            className="admin-action-primary"
          >
            {save.isPending ? "Saving…" : existing.data ? "Update Fantasy game" : "Create Fantasy game"}
          </button>
          {existing.data ? (
            <button
              type="button"
              onClick={() => score.mutate()}
              disabled={score.isPending}
              className="admin-action-secondary"
            >
              {score.isPending ? "Scoring…" : "Score from published results"}
            </button>
          ) : null}
          {save.isError ? <AdminStatus tone="blocked">{save.error instanceof Error ? save.error.message : "Save failed"}</AdminStatus> : null}
          {save.isSuccess ? <AdminStatus tone="ready">Saved</AdminStatus> : null}
          {score.isError ? <AdminStatus tone="blocked">{score.error instanceof Error ? score.error.message : "Scoring failed"}</AdminStatus> : null}
          {score.isSuccess ? <AdminStatus tone="ready">{score.data} team{score.data === 1 ? "" : "s"} scored</AdminStatus> : null}
        </div>
      </div>
    </AdminPage>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-xs font-semibold text-muted-foreground"><span>{label}</span><div className="mt-1.5">{children}</div></label>;
}

function toLocal(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
