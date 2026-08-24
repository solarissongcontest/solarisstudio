import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock3, ShieldCheck, Vote } from "lucide-react";

import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import type { MergedTelevotingEntry } from "@/components/televoting/TelevotingBooth";
import { TelevotingBoothWithReceipt } from "@/components/televoting/TelevotingBoothWithReceipt";
import { Button } from "@/components/ui/button";
import { televotingSupabase } from "@/integrations/televoting/client";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";

export const Route = createFileRoute("/televoting/")({
  head: () => ({
    meta: [
      { title: "Solaris Televoting — Solaris Studio" },
      { name: "description", content: "Vote in Solaris Song Contest televoting rounds." },
    ],
  }),
  component: TelevotingPage,
});

type RoundRow = {
  id: string;
  name: string;
  participant_mode: string | null;
  self_voting_mode: string | null;
  editions: { name: string } | null;
};

type RoundEntry = {
  id: string;
  round_id: string;
  entry_type: string;
  entry_key: string;
  country_code: string | null;
  custom_name: string | null;
  short_name: string | null;
  entry_code: string | null;
  subtitle: string | null;
  image_url: string | null;
  description: string | null;
  display_order: number;
};

type CountryRow = {
  code: string;
  name: string;
  flag: string | null;
  flag_url: string | null;
};

type OpenRound = {
  round: RoundRow;
  entries: MergedTelevotingEntry[];
};

async function loadOpenRound(): Promise<OpenRound | null> {
  const { data: roundRow, error: roundError } = await televotingSupabase
    .from("rounds")
    .select("id,name,participant_mode,self_voting_mode,editions(name)")
    .eq("status", "open")
    .maybeSingle();

  if (roundError) throw roundError;
  if (!roundRow) return null;

  const round = roundRow as unknown as RoundRow;
  const { data: entryRows, error: entriesError } = await televotingSupabase
    .from("round_entries")
    .select("id,round_id,entry_type,entry_key,country_code,custom_name,short_name,entry_code,subtitle,image_url,description,display_order")
    .eq("round_id", round.id)
    .order("display_order", { ascending: true });

  if (entriesError) throw entriesError;

  const entries = (entryRows ?? []) as unknown as RoundEntry[];
  const countryCodes = [...new Set(entries.map((entry) => entry.country_code).filter((code): code is string => Boolean(code)))];
  const countryMap = new Map<string, CountryRow>();

  if (countryCodes.length) {
    const { data: countries, error: countriesError } = await televotingSupabase
      .from("countries")
      .select("code,name,flag,flag_url")
      .in("code", countryCodes);

    if (countriesError) throw countriesError;
    for (const country of (countries ?? []) as unknown as CountryRow[]) countryMap.set(country.code, country);
  }

  return {
    round,
    entries: entries.map((entry) => {
      const country = entry.country_code ? countryMap.get(entry.country_code) : undefined;
      return {
        id: entry.id,
        entry_key: entry.entry_key,
        entry_type: entry.entry_type,
        country_code: entry.country_code,
        display_name: entry.custom_name || entry.short_name || country?.name || entry.entry_key,
        display_code: entry.entry_code || entry.country_code || entry.entry_key,
        subtitle: entry.subtitle,
        image: entry.image_url || country?.flag_url || null,
        flag: country?.flag || null,
        display_order: entry.display_order,
      };
    }),
  };
}

function TelevotingPage() {
  const queryClient = useQueryClient();
  const getServerStatus = useServerFn(getMergedTelevotingServerStatus);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-open-round"],
    queryFn: loadOpenRound,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const { data: serverStatus } = useQuery({
    queryKey: ["merged-televoting-server-status"],
    queryFn: () => getServerStatus(),
    staleTime: 30_000,
  });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["merged-televoting-open-round"] });
    const channel = televotingSupabase
      .channel("merged-televoting-open-round")
      .on("postgres_changes", { event: "*", schema: "televoting", table: "rounds" }, refresh)
      .on("postgres_changes", { event: "*", schema: "televoting", table: "round_entries" }, refresh)
      .subscribe();

    return () => {
      void televotingSupabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <ParticipationRouteChrome>
      <ParticipationServiceShell
        service="televoting"
        title="Televoting"
        description="Cast your Solaris Song Contest ballot when voting is open. Duplicate prevention and integrity checks are applied automatically."
        actions={[
          { to: "/televoting/how-to-vote", label: "How to vote" },
          { to: "/televoting/results", label: "Published results" },
        ]}
      >
        {isLoading ? (
          <section className="data-panel p-8 text-center text-sm text-muted-foreground">Loading the live voting round…</section>
        ) : error ? (
          <section className="data-panel border-destructive/30 p-8 text-center">
            <h2 className="font-display text-xl font-bold">Voting data could not be loaded</h2>
            <p className="mt-2 text-sm text-muted-foreground">Please try again shortly.</p>
          </section>
        ) : !data ? (
          <section className="data-panel p-8 text-center sm:p-10">
            <Clock3 className="mx-auto size-8 text-primary/70" />
            <h2 className="mt-4 font-display text-2xl font-bold">Voting is currently closed</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              There is no open Televoting round right now. This page updates automatically when a voting round opens.
            </p>
          </section>
        ) : (
          <div className="space-y-5">
            <section className="data-panel p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{data.round.editions?.name ?? "Solaris Song Contest"}</p>
                  <h2 className="mt-2 font-display text-2xl font-bold">{data.round.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{data.entries.length} voting entries</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-100">
                  <span className="size-2 rounded-full bg-emerald-300" /> Open
                </span>
              </div>
            </section>

            {serverStatus?.votingReady ? (
              <TelevotingBoothWithReceipt
                roundId={data.round.id}
                roundName={data.round.name}
                editionName={data.round.editions?.name ?? null}
                entries={data.entries}
                selfVotingMode={data.round.self_voting_mode}
              />
            ) : (
              <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.entries.map((entry) => (
                    <article key={entry.id} className="data-panel min-h-32 p-4">
                      <div className="flex items-center gap-3">
                        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface">
                          {entry.image ? <img src={entry.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="text-xl">{entry.flag || "✦"}</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{entry.display_name}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{entry.display_code}{entry.subtitle ? ` · ${entry.subtitle}` : ""}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>

                <section className="data-panel p-6 text-center">
                  <ShieldCheck className="mx-auto size-7 text-primary/75" />
                  <h2 className="mt-3 font-display text-xl font-bold">Voting is temporarily unavailable</h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    This voting round is visible, but ballots cannot be submitted right now. Please try again shortly.
                  </p>
                  <Button className="mt-5" disabled><Vote className="size-4" /> Enter voting booth</Button>
                </section>
              </>
            )}
          </div>
        )}
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
