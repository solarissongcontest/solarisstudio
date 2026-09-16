import { useLocation } from "@tanstack/react-router";
import { Check, Copy, Sparkles, Trophy } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import {
  editionIsInAnniversaryYear,
  finalRankingIsResolved,
  getSolarisAnniversarySeason,
} from "@/lib/anniversary";
import { getAnniversaryPreviewPhase } from "@/lib/anniversary-preview";
import { useAllParticipants, useAllResults, useAllShows, useEditions, type Edition } from "@/lib/data";

type DatedEdition = Edition & { event_date?: string | null };

export function MySolarisAnniversaryRecap() {
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const previewPhase = getAnniversaryPreviewPhase(searchStr);
  const anniversary = getSolarisAnniversarySeason();
  const visible =
    anniversary.phase === "active" ||
    anniversary.phase === "after" ||
    previewPhase === "active" ||
    previewPhase === "after";
  const { countryAccount } = useMySolaris();
  const country = countryAccount?.country;
  const { data: editions } = useEditions();
  const { data: participants } = useAllParticipants();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();
  const [copied, setCopied] = useState(false);

  const recap = useMemo(() => {
    if (!country) return null;

    const publishedEditions = (editions ?? []).filter((edition) => edition.published) as DatedEdition[];
    const editionMap = new Map(publishedEditions.map((edition) => [edition.id, edition]));
    const participationEditionIds = new Set(
      (participants ?? [])
        .filter((entry) => entry.country_id === country.id && editionMap.has(entry.edition_id))
        .map((entry) => entry.edition_id),
    );
    const participationEditions = [...participationEditionIds]
      .map((id) => editionMap.get(id))
      .filter((edition): edition is DatedEdition => Boolean(edition))
      .sort((a, b) => (a.edition_number ?? 999) - (b.edition_number ?? 999));

    const finalShows = (shows ?? []).filter(
      (show) =>
        show.published &&
        editionMap.has(show.edition_id) &&
        (show.kind === "grand-final" || show.kind === "final"),
    );
    const resolvedFinalIds = new Set(
      finalShows
        .filter((show) => {
          const ranking = (results ?? [])
            .filter((result) => result.show_id === show.id && result.final_rank != null)
            .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999));
          return finalRankingIsResolved(ranking);
        })
        .map((show) => show.id),
    );
    const finalResults = (results ?? [])
      .filter(
        (result) =>
          result.country_id === country.id &&
          result.show_id &&
          resolvedFinalIds.has(result.show_id) &&
          result.final_rank != null,
      )
      .sort((a, b) => {
        const editionA = editionMap.get(a.edition_id);
        const editionB = editionMap.get(b.edition_id);
        const dateCompare = (editionB?.event_date ?? "").localeCompare(editionA?.event_date ?? "");
        if (dateCompare !== 0) return dateCompare;
        return (editionB?.edition_number ?? -1) - (editionA?.edition_number ?? -1);
      });

    const latest = finalResults[0] ?? null;
    const bestRank = finalResults.reduce<number | null>(
      (best, result) =>
        result.final_rank == null ? best : best == null ? result.final_rank : Math.min(best, result.final_rank),
      null,
    );
    const bestScore = finalResults.reduce((best, result) => Math.max(best, result.total_points ?? 0), 0);
    const wins = finalResults.filter((result) => result.final_rank === 1).length;
    const anniversaryEntries = participationEditions.filter((edition) =>
      editionIsInAnniversaryYear(edition, anniversary.year),
    ).length;
    const debut = participationEditions[0] ?? null;
    const latestEdition = latest ? editionMap.get(latest.edition_id) : null;

    return {
      participations: participationEditions.length,
      anniversaryEntries,
      wins,
      bestRank,
      bestScore,
      debut: debut?.edition_number != null ? `SSC ${debut.edition_number}` : debut?.name ?? "—",
      latestResult:
        latest && latestEdition
          ? `${latestEdition.edition_number != null ? `SSC ${latestEdition.edition_number}` : latestEdition.name} · #${latest.final_rank} · ${latest.total_points ?? 0} pts`
          : "No resolved final result yet",
    };
  }, [anniversary.year, country, editions, participants, results, shows]);

  if (!visible || !country || !recap) return null;

  const shareText = `${country.name} · ${anniversary.age} years of Solaris\n${recap.participations} participations · ${recap.wins} wins · best finish ${recap.bestRank ? `#${recap.bestRank}` : "—"} · best score ${recap.bestScore || "—"} pts\nLatest final: ${recap.latestResult}`;

  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] via-surface to-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            <Sparkles className="size-3.5" /> Your Solaris story
          </p>
          <h2 className="mt-2 font-display text-2xl font-black tracking-[-0.04em] sm:text-3xl">
            {country.name} across {anniversary.age} years of Solaris
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A personalized anniversary recap built from the published contest archive. Unresolved current-edition placeholder results are excluded.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyRecap()}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background/40 px-3 text-xs font-semibold transition-colors hover:border-primary/45 hover:text-primary"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy recap"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-4">
        <StoryStat label="Participations" value={recap.participations} />
        <StoryStat label="This anniversary year" value={recap.anniversaryEntries} />
        <StoryStat label="Wins" value={recap.wins} icon={<Trophy className="size-3.5" />} />
        <StoryStat label="Best finish" value={recap.bestRank ? `#${recap.bestRank}` : "—"} />
        <StoryStat label="Debut" value={recap.debut} />
        <StoryStat label="Best score" value={recap.bestScore ? `${recap.bestScore} pts` : "—"} />
        <div className="col-span-2 bg-surface/90 p-4 sm:col-span-2">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">Latest resolved final</p>
          <p className="mt-1 text-sm font-semibold">{recap.latestResult}</p>
        </div>
      </div>
    </section>
  );
}

function StoryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-surface/90 p-4">
      <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        {icon}{label}
      </p>
      <strong className="mt-1 block text-xl font-black tracking-[-0.03em]">{value}</strong>
    </div>
  );
}
