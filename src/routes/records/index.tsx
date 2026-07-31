import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { computeHistoricalRecords } from "@/lib/stats";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/records/")({
  head: () => ({
    meta: [
      { title: "SSC records — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Every all-time Solaris Song Contest record: most wins, most participations, streaks, droughts, biggest comebacks and voting milestones.",
      },
      { property: "og:title", content: "SSC records — Solaris Scoreboard Studio" },
      { property: "og:description", content: "The complete Terra Solaris hall of records." },
    ],
  }),
  component: RecordsPage,
});

type Rec = { label: string; value: string; detail: string; countryCode?: string; editionSlug?: string; showId?: string };

const CATEGORIES = ["Career", "Streaks", "Single edition", "Voting"] as const;

function RecordsPage() {
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("Career");

  const cList = countries ?? [];
  const byName = new Map(cList.map((c) => [c.name, c]));
  const byId = new Map(cList.map((c) => [c.id, c]));
  const editionByYear = new Map((editions ?? []).map((e) => [e.year, e]));
  const showById = new Map((shows ?? []).map((s) => [s.id, s]));
  const editionBySlug = new Map((editions ?? []).map((e) => [e.id, e]));

  const linkFor = (detail: string): { countryCode?: string; editionSlug?: string } => {
    const [namePart, yearPart] = detail.split("·").map((s) => s.trim());
    const c = byName.get(namePart);
    const yr = yearPart ? Number(yearPart) : NaN;
    const ed = !Number.isNaN(yr) ? editionByYear.get(yr) : undefined;
    return { countryCode: c?.short_code, editionSlug: ed?.slug };
  };

  const generic: Rec[] = useMemo(() => {
    const raw = computeHistoricalRecords({
      countries: cList,
      editions: editions ?? [],
      shows: shows ?? [],
      participants: participants ?? [],
      results: results ?? [],
      jury: jury ?? [],
    });
    return raw.map((r) => ({ ...r, ...linkFor(r.detail) }));
  }, [cList, editions, shows, participants, results, jury]);

  const careerAggregates = useMemo((): Rec[] => {
    const out: Rec[] = [];
    const finals = (results ?? []).filter((r) => showById.get(r.show_id ?? "")?.kind === "grand-final");
    const byCountry = new Map<string, typeof finals>();
    finals.forEach((r) => byCountry.set(r.country_id, [...(byCountry.get(r.country_id) ?? []), r]));

    const push = (label: string, entries: [string, number][], suffix = "") => {
      const top = entries.sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0) {
        const c = byId.get(top[0]);
        out.push({ label, value: `${top[1]}${suffix}`, detail: c?.name ?? "?", countryCode: c?.short_code });
      }
    };

    push(
      "Most successful country (wins)",
      [...byCountry.entries()].map(([id, rows]) => [id, rows.filter((r) => r.final_rank === 1).length]),
    );
    const partCounts = new Map<string, number>();
    (participants ?? []).forEach((p) => partCounts.set(p.country_id, (partCounts.get(p.country_id) ?? 0) + 1));
    push("Most participations", [...partCounts.entries()]);
    push("Most grand finals reached", [...byCountry.entries()].map(([id, rows]) => [id, rows.length]));
    push(
      "Most top-5 finishes",
      [...byCountry.entries()].map(([id, rows]) => [id, rows.filter((r) => (r.final_rank ?? 99) <= 5).length]),
    );
    push(
      "Most top-10 finishes",
      [...byCountry.entries()].map(([id, rows]) => [id, rows.filter((r) => (r.final_rank ?? 99) <= 10).length]),
    );
    const received = new Map<string, number>();
    (results ?? []).forEach((r) => received.set(r.country_id, (received.get(r.country_id) ?? 0) + r.total_points));
    push("Most points received (career)", [...received.entries()], " pts");
    const given = new Map<string, number>();
    (jury ?? []).forEach((v) => {
      if (!v.voter_country_id) return;
      given.set(v.voter_country_id, (given.get(v.voter_country_id) ?? 0) + v.points);
    });
    push("Most points awarded (career)", [...given.entries()], " pts");
    const twelvesReceived = new Map<string, number>();
    (jury ?? []).filter((v) => v.points === 12).forEach((v) => twelvesReceived.set(v.receiving_country_id, (twelvesReceived.get(v.receiving_country_id) ?? 0) + 1));
    push("Most 12 points received", [...twelvesReceived.entries()]);
    const twelvesGiven = new Map<string, number>();
    (jury ?? []).filter((v) => v.points === 12 && v.voter_country_id).forEach((v) => twelvesGiven.set(v.voter_country_id, (twelvesGiven.get(v.voter_country_id) ?? 0) + 1));
    push("Most 12 points given", [...twelvesGiven.entries()]);

    return out;
  }, [results, participants, jury, byId, showById]);

  const singleEditionAggregates = useMemo((): Rec[] => {
    const out: Rec[] = [];
    const finals = (results ?? []).filter((r) => showById.get(r.show_id ?? "")?.kind === "grand-final");
    const byShow = new Map<string, typeof finals>();
    finals.forEach((r) => byShow.set(r.show_id ?? "", [...(byShow.get(r.show_id ?? "") ?? []), r]));
    let closest: { margin: number; winner: string; showId: string } | null = null;
    let comeback: { delta: number; countryId: string; showId: string } | null = null;
    byShow.forEach((rows, showId) => {
      const sorted = [...rows].sort((a, b) => b.total_points - a.total_points);
      if (sorted.length >= 2) {
        const margin = sorted[0].total_points - sorted[1].total_points;
        if (!closest || margin < closest.margin) closest = { margin, winner: sorted[0].country_id, showId };
      }
      rows.forEach((r) => {
        const delta = r.televote_points - r.jury_points;
        if (!comeback || delta > comeback.delta) comeback = { delta, countryId: r.country_id, showId };
      });
    });
    if (closest) {
      const c = byId.get(closest.winner);
      const ed = editionBySlug.get(showById.get(closest.showId)?.edition_id ?? "");
      out.push({
        label: "Closest victory",
        value: `${closest.margin} pt${closest.margin === 1 ? "" : "s"}`,
        detail: `${c?.name ?? "?"} · ${ed?.year ?? ""}`,
        countryCode: c?.short_code,
        editionSlug: ed?.slug,
        showId: closest.showId,
      });
    }
    if (comeback && comeback.delta > 0) {
      const c = byId.get(comeback.countryId);
      const ed = editionBySlug.get(showById.get(comeback.showId)?.edition_id ?? "");
      out.push({
        label: "Biggest televote comeback (single show)",
        value: `+${comeback.delta} pts`,
        detail: `${c?.name ?? "?"} · ${ed?.year ?? ""}`,
        countryCode: c?.short_code,
        editionSlug: ed?.slug,
        showId: comeback.showId,
      });
    }
    return out;
  }, [results, byId, showById, editionBySlug]);

  const votingAggregates = generic.filter((r) => /collapse|comeback|jury|televote/i.test(r.label));
  const careerAll = [...careerAggregates, ...generic.filter((r) => /participations|winners defeated/i.test(r.label))];
  const streaks = generic.filter((r) => /streak|drought/i.test(r.label));
  const singleEdition = [...singleEditionAggregates, ...generic.filter((r) => /most points in one edition/i.test(r.label))];

  const active =
    cat === "Career" ? careerAll : cat === "Streaks" ? streaks : cat === "Single edition" ? singleEdition : votingAggregates;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Hall of records"
        title="All-time SSC records"
        description="Automatically recalculated from every stored edition, vote and result. Every card links to the country, edition or show behind it."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              c === cat
                ? "rounded-lg bg-surface-strong px-3 py-1.5 text-sm font-medium"
                : "rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface"
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((r, i) => (
          <RecordCard key={i} rec={r} />
        ))}
        {!active.length && (
          <p className="text-sm text-muted-foreground">No records in this category yet — check back once more editions are completed.</p>
        )}
      </div>
    </AppShell>
  );
}

function RecordCard({ rec }: { rec: Rec }) {
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{rec.label}</p>
      <p className="numeric text-gold-grad mt-2 text-3xl font-bold">{rec.value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{rec.detail}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {rec.countryCode && (
          <Link to="/countries/$code" params={{ code: rec.countryCode }} className="text-primary hover:underline">
            View country →
          </Link>
        )}
        {rec.editionSlug && (
          <Link to="/editions/$slug" params={{ slug: rec.editionSlug }} className="text-primary hover:underline">
            View edition →
          </Link>
        )}
        {rec.showId && (
          <Link to="/shows/$showId" params={{ showId: rec.showId }} className="text-primary hover:underline">
            View show →
          </Link>
        )}
      </div>
    </>
  );
  return <div className="glass p-5">{body}</div>;
}
