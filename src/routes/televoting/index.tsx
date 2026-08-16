import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, ShieldCheck, Sparkles, Vote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { televotingSupabase } from "@/integrations/televoting/client";

export const Route = createFileRoute("/televoting/")({
  head: () => ({
    meta: [
      { title: "Solaris Televoting — Solaris Studio" },
      { name: "description", content: "The Solaris Song Contest televoting portal inside Solaris Studio." },
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
  entries: Array<RoundEntry & { display_name: string; display_code: string; image: string | null; flag: string | null }>;
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
        ...entry,
        display_name: entry.custom_name || entry.short_name || country?.name || entry.entry_key,
        display_code: entry.entry_code || entry.country_code || entry.entry_key,
        image: entry.image_url || country?.flag_url || null,
        flag: country?.flag || null,
      };
    }),
  };
}

function TelevotingPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["merged-televoting-open-round"],
    queryFn: loadOpenRound,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ["merged-televoting-open-round"] });
    const channel = televotingSupabase
      .channel("merged-televoting-open-round")
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_entries" }, refresh)
      .subscribe();

    return () => {
      void televotingSupabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="mx-auto max-w-5xl py-4 sm:py-8">
      <header className="mb-8 text-center sm:mb-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.045] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-sky-100/70">
          <Sparkles className="size-3" /> Solaris Song Contest
        </div>
        <h1 className="font-display text-5xl uppercase leading-[0.9] sm:text-7xl">Televoting</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          The live voting portal is being absorbed into Solaris Studio while keeping the existing Televoting database and integrity controls intact.
        </p>
      </header>

      {isLoading ? (
        <section className="glass-strong p-8 text-center text-sm text-muted-foreground">Loading the live voting round…</section>
      ) : error ? (
        <section className="glass-strong border-destructive/30 p-8 text-center">
          <h2 className="text-xl font-medium">Voting data could not be loaded</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
        </section>
      ) : !data ? (
        <section className="glass-strong p-8 text-center sm:p-10">
          <Clock3 className="mx-auto size-8 text-sky-100/70" />
          <h2 className="mt-4 text-2xl font-medium">Voting is currently closed</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">There is no open Televoting round right now. This page updates automatically when the existing voting backend opens one.</p>
        </section>
      ) : (
        <div className="space-y-5">
          <section className="glass-strong p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-100/60">{data.round.editions?.name ?? "Solaris Song Contest"}</p>
                <h2 className="mt-2 text-2xl font-medium">{data.round.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{data.entries.length} voting entries · live from the existing Televoting database</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-100">
                <span className="size-2 rounded-full bg-emerald-300" /> Open
              </span>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.entries.map((entry) => (
              <article key={entry.id} className="glass min-h-32 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.045]">
                    {entry.image ? <img src={entry.image} alt="" className="h-full w-full object-cover" /> : <span className="text-xl">{entry.flag || "✦"}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{entry.display_name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{entry.display_code}{entry.subtitle ? ` · ${entry.subtitle}` : ""}</p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <section className="glass-strong p-6 text-center">
            <ShieldCheck className="mx-auto size-7 text-sky-100/75" />
            <h2 className="mt-3 text-xl font-medium">Secure voting submission is being connected</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              The live round and entries are already integrated here. Actual ballot submission still runs through the existing hardened Televoting Worker until its server-only Supabase credentials are moved safely into Solaris Studio.
            </p>
            <Button className="mt-5" disabled><Vote className="size-4" /> Enter voting booth</Button>
          </section>
        </div>
      )}
    </div>
  );
}
