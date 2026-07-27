import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { Scoreboard } from "@/components/Scoreboard";
import { useAllJuryVotes, useAllResults, useCountries, useEditions, useResults } from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Solaris Scoreboard Studio — Solaris Song Contest HQ" },
      {
        name: "description",
        content:
          "Run, score and analyse the Solaris Song Contest: jury voting, televote reveals, animated broadcast scoreboards and deep Terra Solaris voting statistics.",
      },
      { property: "og:title", content: "Solaris Scoreboard Studio — Solaris Song Contest HQ" },
      {
        property: "og:description",
        content:
          "Voting management, live broadcast scoreboards and voting-pattern analytics for the Terra Solaris universe.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: editions } = useEditions();
  const { data: countries } = useCountries();
  const { data: allResults } = useAllResults();
  const { data: allJury } = useAllJuryVotes();

  const latest = editions?.[0];
  const completed = editions?.find((e) => e.status === "completed");
  const { data: results } = useResults(completed?.id);

  const cMap = new Map((countries ?? []).map((c) => [c.id, c]));
  const standings = (results ?? [])
    .map((r) => ({
      countryId: r.country_id,
      jury: r.jury_points,
      televote: r.televote_points,
      total: r.total_points,
      rank: r.final_rank ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris"
        title="Solaris Scoreboard Studio"
        description="The control room for the Solaris Song Contest — build editions, collect jury and televote points, run a broadcast-grade reveal, and mine every voting relationship in Terra Solaris."
        actions={
          <>
            <Link to="/admin" className="bg-aurora rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground">
              Open Studio
            </Link>
            {latest && (
              <Link
                to="/editions/$slug"
                params={{ slug: latest.slug }}
                className="glass rounded-xl px-4 py-2 text-sm font-semibold"
              >
                {latest.name}
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Editions" value={editions?.length ?? 0} hint="Across SSC history" />
        <StatTile label="Countries" value={countries?.length ?? 0} hint="Terra Solaris members" />
        <StatTile label="Jury votes cast" value={allJury?.length ?? 0} hint="Individual point awards" />
        <StatTile
          label="Points awarded"
          value={(allResults ?? []).reduce((a, r) => a + r.total_points, 0)}
          hint="All editions combined"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel
          title={completed ? `${completed.name} — final top 6` : "No completed edition yet"}
          description={completed ? `${completed.year} · hosted in ${completed.host_city}` : undefined}
          actions={
            completed && (
              <Link
                to="/editions/$slug"
                params={{ slug: completed.slug }}
                className="text-xs text-primary hover:underline"
              >
                Full scoreboard →
              </Link>
            )
          }
        >
          <Scoreboard standings={standings} countries={cMap} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Editions" description="Every Solaris Song Contest on record">
            <ul className="space-y-2">
              {(editions ?? []).map((e) => (
                <li key={e.id}>
                  <Link
                    to="/editions/$slug"
                    params={{ slug: e.slug }}
                    className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 transition-colors hover:bg-surface-strong"
                  >
                    <span>
                      <span className="block text-sm font-medium">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {e.year} · {e.host_city ?? "Host TBA"}
                      </span>
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {e.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Delegations" description="Terra Solaris participating nations">
            <div className="flex flex-wrap gap-2">
              {(countries ?? []).map((c) => (
                <Link
                  key={c.id}
                  to="/countries/$code"
                  params={{ code: c.short_code }}
                  className="flex items-center gap-2 rounded-xl bg-surface px-2 py-1.5 text-xs transition-colors hover:bg-surface-strong"
                >
                  <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                  {c.name}
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
