import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { computeRecords } from "@/lib/analysis";
import { useAllJuryVotes, useAllResults, useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/records/")({
  head: () => ({
    meta: [
      { title: "SSC records — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "All-time Solaris Song Contest records: highest scores, biggest margins, most 12 points, televote climbs and jury drops.",
      },
      { property: "og:title", content: "SSC records — Solaris Scoreboard Studio" },
      { property: "og:description", content: "All-time Solaris Song Contest records and milestones." },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const editionYear = new Map((editions ?? []).map((e) => [e.id, e.year]));
  const records = computeRecords(results ?? [], jury ?? [], countries ?? [], editionYear);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Hall of records"
        title="All-time SSC records"
        description="Automatically recalculated from every stored edition, vote and result."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {records.map((r) => (
          <div key={r.label} className="glass p-5">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{r.label}</p>
            <p className="numeric text-gold-grad mt-2 text-3xl font-bold">{r.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{r.detail}</p>
          </div>
        ))}
        {!records.length && (
          <p className="text-sm text-muted-foreground">No completed editions yet — records appear once results exist.</p>
        )}
      </div>
    </AppShell>
  );
}
