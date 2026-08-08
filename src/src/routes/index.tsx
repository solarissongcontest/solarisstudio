import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Solaris Studio" },
      {
        name: "description",
        content: "Solaris Song Contest editions, countries, results and production tools.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: countries } = useCountries();
  const { data: results } = useAllResults();

  const publishedEditions = (editions ?? []).filter((edition) => edition.published);
  const latest = publishedEditions[0] ?? (editions ?? [])[0];
  const latestShows = (shows ?? []).filter(
    (show) => show.edition_id === latest?.id && show.published,
  );
  const winnerRows = (results ?? []).filter((row) => row.final_rank === 1);
  const countryMap = new Map((countries ?? []).map((country) => [country.id, country]));
  const latestWinner = [...winnerRows]
    .reverse()
    .map((row) => countryMap.get(row.country_id))
    .find(Boolean);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Solaris Song Contest"
        title="Everything Solaris, without the clutter."
        description="Browse editions, countries and results, or open Studio when you need to manage the contest."
        actions={
          <>
            <Link
              to="/editions"
              className="bg-aurora rounded-xl px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Browse editions
            </Link>
            <Link
              to="/admin"
              className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
            >
              Open Studio
            </Link>
          </>
        }
      />

      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <StatTile label="Editions" value={editions?.length ?? 0} />
          <StatTile label="Countries" value={countries?.length ?? 0} />
          <StatTile label="Shows" value={shows?.length ?? 0} />
          <StatTile label="Latest winner" value={latestWinner?.name ?? "—"} />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
        <Panel
          title={latest ? `${editionLabel(latest)} · ${latest.name}` : "Latest edition"}
          description={
            latest
              ? [latest.host_city, latest.year].filter(Boolean).join(" · ")
              : "No edition has been created yet."
          }
          actions={
            latest ? (
              <Link
                to="/editions/$slug"
                params={{ slug: latest.slug }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Open edition →
              </Link>
            ) : null
          }
        >
          {latestShows.length ? (
            <div className="divide-y divide-border/60">
              {latestShows.map((show) => (
                <Link
                  key={show.id}
                  to="/shows/$showId"
                  params={{ showId: show.id }}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{show.name}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {show.kind.replace("-", " ")}
                    </p>
                  </div>
                  <span className="text-xs text-primary">View →</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No published shows in this edition yet.</p>
          )}
        </Panel>

        <Panel
          title="Countries"
          description="Jump straight to a delegation profile."
          actions={
            <Link to="/countries" className="text-xs font-medium text-primary hover:underline">
              All countries →
            </Link>
          }
        >
          <div className="flex flex-wrap gap-2">
            {(countries ?? []).slice(0, 28).map((country) => (
              <Link
                key={country.id}
                to="/countries/$code"
                params={{ code: country.short_code }}
                title={country.name}
              >
                <FlagChip
                  code={country.short_code}
                  color={country.accent_color}
                  image={country.flag_image}
                  size="sm"
                />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <QuickLink
          title="Compare countries"
          body="Put two delegations side by side."
          to="/compare"
        />
        <QuickLink
          title="Voting relationships"
          body="Explore alliances and rivalries."
          to="/relationships"
        />
        <QuickLink
          title="Records"
          body="See the all-time leaders."
          to="/records"
        />
      </div>
    </AppShell>
  );
}

function QuickLink({
  title,
  body,
  to,
}: {
  title: string;
  body: string;
  to: "/compare" | "/relationships" | "/records";
}) {
  return (
    <Link to={to} className="glass block p-4 transition-transform hover:-translate-y-0.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      <p className="mt-3 text-xs font-medium text-primary">Open →</p>
    </Link>
  );
}
