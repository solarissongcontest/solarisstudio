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
      { title: "Solaris Spectacle Suite — Contest OS for Terra Solaris" },
      {
        name: "description",
        content:
          "Plan editions, build shows, run jury and televote voting, design broadcast themes and analyse every Solaris Song Contest result in one production suite.",
      },
      { property: "og:title", content: "Solaris Spectacle Suite" },
      {
        property: "og:description",
        content: "Contest management, broadcast production and analytics for the Solaris Song Contest.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: countries } = useCountries();
  const { data: results } = useAllResults();

  const published = (editions ?? []).filter((e) => e.published);
  const latest = published[0] ?? (editions ?? [])[0];
  const latestShows = (shows ?? []).filter((s) => s.edition_id === latest?.id && s.published);
  const winners = (results ?? []).filter((r) => r.final_rank === 1);
  const countryMap = new Map((countries ?? []).map((c) => [c.id, c]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris broadcasting union"
        title="Solaris Spectacle Suite"
        description="A complete contest operating system: editions and shows, a voting system builder, a design engine for on-screen graphics, a broadcast control room and cross-edition analytics."
        actions={
          <>
            <Link to="/editions" className="bg-aurora rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground">
              Browse editions
            </Link>
            <Link to="/admin" className="rounded-lg border border-border px-4 py-2 text-sm">
              Open Studio
            </Link>
          </>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Editions" value={editions?.length ?? 0} hint={`${published.length} published`} />
        <StatTile label="Shows" value={shows?.length ?? 0} hint="semi-finals, finals & specials" />
        <StatTile label="Nations" value={countries?.length ?? 0} hint="official Terra Solaris delegations" />
        <StatTile label="Victories recorded" value={winners.length} hint="across all published shows" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title={latest ? `${editionLabel(latest)} — ${latest.name}` : "No editions yet"}
          description={latest ? [latest.host_city, latest.year].filter(Boolean).join(" · ") : "Create your first edition in the Studio."}
          actions={
            latest ? (
              <Link
                to="/editions/$slug"
                params={{ slug: latest.slug }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs"
              >
                Open edition
              </Link>
            ) : null
          }
        >
          {latestShows.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {latestShows.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/shows/$showId"
                    params={{ showId: s.id }}
                    className="glass flex items-center justify-between px-4 py-3 transition-colors hover:bg-surface-strong"
                  >
                    <span>
                      <span className="block text-sm font-medium">{s.name}</span>
                      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                        {s.kind.replace("-", " ")}
                      </span>
                    </span>
                    <span className="text-xs text-primary">View →</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No published shows yet. Shows stay private until you publish them from the Studio.
            </p>
          )}
        </Panel>

        <Panel title="Delegations" description="Every nation of Terra Solaris, ready to be drafted into a show.">
          <div className="flex flex-wrap gap-1.5">
            {(countries ?? []).slice(0, 40).map((c) => (
              <Link key={c.id} to="/countries/$code" params={{ code: c.short_code }} title={c.name}>
                <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
              </Link>
            ))}
          </div>
          <Link to="/countries" className="mt-4 inline-block text-xs text-primary">
            See all {countries?.length ?? 0} nations →
          </Link>
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Show builder", body: "Independent semi-finals, finals and specials — each with its own line-up, rules and look." },
          { title: "Voting engine", body: "Any point scale, jury/televote weighting, tie-break chains and qualifier counts." },
          { title: "Design engine", body: "Backgrounds, palettes, fonts, card shapes and flag styles saved as reusable themes." },
          { title: "Control room", body: "Speed-controlled reveals from 0.25× to 2×, scene toggles and instant replay." },
        ].map((f) => (
          <div key={f.title} className="glass p-5">
            <h3 className="font-display text-sm font-semibold">{f.title}</h3>
            <p className="mt-2 text-xs text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
