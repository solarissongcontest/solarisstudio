import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy } from "lucide-react";

import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import { getMergedPublishedTelevotingResults } from "@/integrations/televoting/results.functions";
import { televotingSupabase } from "@/integrations/televoting/client";
import { getMergedTelevotingServerStatus } from "@/integrations/televoting/status.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/televoting/results")({
  head: () => ({
    meta: [
      { title: "Televote Results — Solaris Studio" },
      { name: "description", content: "Official published Solaris Song Contest televote results." },
    ],
  }),
  component: TelevotingResultsPage,
});

type ResultMode = "converted" | "original" | "compare";

type EntryMeta = {
  id: string;
  entry_key: string;
  entry_type: string;
  country_code: string | null;
  custom_name: string | null;
  short_name: string | null;
  entry_code: string | null;
  subtitle: string | null;
  image_url: string | null;
  display_order: number;
  displayName: string;
  displayCode: string;
  image: string | null;
  flag: string | null;
};

async function loadRoundEntries(roundId: string): Promise<EntryMeta[]> {
  const { data: entries, error: entryError } = await televotingSupabase
    .from("round_entries")
    .select("id,entry_key,entry_type,country_code,custom_name,short_name,entry_code,subtitle,image_url,display_order")
    .eq("round_id", roundId)
    .order("display_order");
  if (entryError) throw entryError;

  const raw = (entries ?? []) as Array<{
    id: string;
    entry_key: string;
    entry_type: string;
    country_code: string | null;
    custom_name: string | null;
    short_name: string | null;
    entry_code: string | null;
    subtitle: string | null;
    image_url: string | null;
    display_order: number;
  }>;

  const codes = [...new Set(raw.map((entry) => entry.country_code).filter((code): code is string => Boolean(code)))];
  const countryMap = new Map<string, { name: string; flag: string | null; flag_url: string | null }>();

  if (codes.length) {
    const { data: countries, error: countryError } = await televotingSupabase
      .from("countries")
      .select("code,name,flag,flag_url")
      .in("code", codes);
    if (countryError) throw countryError;
    for (const country of countries ?? []) countryMap.set(country.code, country);
  }

  return raw.map((entry) => {
    const country = entry.country_code ? countryMap.get(entry.country_code) : undefined;
    return {
      ...entry,
      displayName: entry.custom_name || entry.short_name || country?.name || entry.entry_key,
      displayCode: entry.entry_code || entry.country_code || entry.entry_key,
      image: entry.image_url || country?.flag_url || null,
      flag: country?.flag || null,
    };
  });
}

function TelevotingResultsPage() {
  const [mode, setMode] = useState<ResultMode>("converted");
  const getStatus = useServerFn(getMergedTelevotingServerStatus);
  const getResults = useServerFn(getMergedPublishedTelevotingResults);

  const { data: serverStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["merged-televoting-server-status"],
    queryFn: () => getStatus(),
    staleTime: 30_000,
  });

  const { data, isLoading: resultsLoading, error } = useQuery({
    queryKey: ["merged-televoting-published-results"],
    queryFn: () => getResults({ data: {} }),
    enabled: serverStatus?.votingReady === true,
    refetchInterval: 15_000,
  });

  const round = data?.round ?? null;
  const rows = data?.rows ?? [];

  const { data: entries = [] } = useQuery({
    queryKey: ["merged-televoting-result-entries", round?.id],
    queryFn: () => loadRoundEntries(round!.id),
    enabled: Boolean(round?.id),
    staleTime: 60_000,
  });

  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.entry_key, entry])), [entries]);
  const totalOriginal = rows.reduce((sum, row) => sum + Number(row.original_votes ?? 0), 0);
  const totalConverted = rows.reduce((sum, row) => sum + Number(row.final_points ?? 0), 0);
  const title = round ? `${round.edition ? `${round.edition} · ` : ""}${round.name}` : "Televote results";

  return (
    <ParticipationRouteChrome>
      <ParticipationServiceShell
        service="televoting"
        title={title}
        description={round ? `${round.total_points} converted televote points · calculation v${round.version}` : "Official published Solaris Song Contest televote results."}
        actions={[
          { to: "/televoting", label: "Voting" },
          { to: "/televoting/how-to-vote", label: "How to vote" },
        ]}
        maxWidth="max-w-4xl"
      >
        {statusLoading || resultsLoading ? (
          <section className="data-panel p-8 text-center text-sm text-muted-foreground">Loading published results…</section>
        ) : serverStatus && !serverStatus.votingReady ? (
          <section className="data-panel p-8 text-center">
            <Trophy className="mx-auto size-8 text-primary/70" />
            <h2 className="mt-4 font-display text-xl font-bold">Results server prepared</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Published-result code is integrated, but this preview cannot currently read the protected published result payload.</p>
          </section>
        ) : error ? (
          <section className="data-panel border-destructive/30 p-6 text-sm text-destructive">{error instanceof Error ? error.message : "Results could not be loaded."}</section>
        ) : !round ? (
          <section className="data-panel p-8 text-center">
            <Trophy className="mx-auto size-8 text-primary/70" />
            <h2 className="mt-4 font-display text-xl font-bold">No results published yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Published televote scoreboards appear here after the organizer publishes a calculated round.</p>
          </section>
        ) : (
          <div className="space-y-4">
            <section className="grid grid-cols-3 gap-2">
              <Stat label="Entries" value={rows.length} />
              <Stat label="Original" value={totalOriginal} />
              <Stat label="Converted" value={totalConverted} />
            </section>

            <div className="data-panel flex gap-1 p-1.5">
              {(["converted", "original", "compare"] as ResultMode[]).map((item) => (
                <button key={item} type="button" onClick={() => setMode(item)} className={cn("flex-1 rounded-xl px-3 py-2 text-xs font-semibold capitalize transition", mode === item ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground")}>{item}</button>
              ))}
            </div>

            <section className="space-y-2">
              {rows.map((row, index) => {
                const entryKey = row.entry_key || row.country_code || "";
                const entry = entryMap.get(entryKey);
                const originalRank = Number(row.original_rank || index + 1);
                const convertedRank = index + 1;
                const movement = originalRank - convertedRank;
                return (
                  <article key={`${entryKey}-${index}`} className={cn("data-panel grid items-center gap-3 px-3 py-3 sm:px-4", index === 0 && "ring-1 ring-primary/30", mode === "compare" ? "grid-cols-[34px_minmax(0,1fr)_80px_80px]" : "grid-cols-[34px_minmax(0,1fr)_96px]") }>
                    <div className={cn("grid size-8 place-items-center rounded-full text-sm font-semibold tabular-nums", index === 0 ? "bg-primary/20 text-primary" : "bg-surface text-muted-foreground")}>{convertedRank}</div>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface">{entry?.image ? <img src={entry.image} alt="" className="h-full w-full object-cover" /> : <span>{entry?.flag || "✦"}</span>}</div>
                      <div className="min-w-0"><p className="truncate font-semibold">{entry?.displayName || entryKey}</p>{mode === "compare" ? <p className="mt-0.5 text-[10px] text-muted-foreground">original #{originalRank}{movement ? ` · ${movement > 0 ? "▲" : "▼"}${Math.abs(movement)}` : " · unchanged"}</p> : null}</div>
                    </div>
                    {mode === "converted" ? <Score value={row.final_points} label="points" strong /> : null}
                    {mode === "original" ? <Score value={row.original_votes} label="raw" /> : null}
                    {mode === "compare" ? <><Score value={row.original_votes} label="raw" /><Score value={row.final_points} label="points" strong /></> : null}
                  </article>
                );
              })}
            </section>

            {round.advanced ? <section className="data-panel p-5 text-sm text-muted-foreground">Advanced transparency is enabled for this published result. Rank factor, weighted score, exact points, floor, decimal remainder and remainder bonus remain available for deeper result views.</section> : null}
          </div>
        )}
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="data-panel p-4 text-center"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p><p className="numeric mt-2 text-2xl font-semibold">{value}</p></div>;
}

function Score({ value, label, strong = false }: { value: number; label: string; strong?: boolean }) {
  return <div className="text-right"><p className={cn("numeric text-xl", strong ? "font-semibold text-primary" : "font-medium")}>{value}</p><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p></div>;
}
