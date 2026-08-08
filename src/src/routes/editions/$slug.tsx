import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
} from "@/lib/data";

export const Route = createFileRoute("/editions/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — Solaris Studio` }],
  }),
  component: EditionPage,
});

function EditionPage() {
  const { slug } = Route.useParams();
  const { data: edition, isLoading } = useEdition(slug);
  const { data: shows } = useShows(edition?.id);
  const { data: participants } = useParticipants(edition?.id);
  const { data: countries } = useCountries();

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (!edition) {
    return (
      <AppShell>
        <PageHeader title="Edition not found" />
        <Link to="/editions" className="text-sm text-primary">
          ← All editions
        </Link>
      </AppShell>
    );
  }

  const countryMap = new Map((countries ?? []).map((country) => [country.id, country]));
  const nationIds = new Set((participants ?? []).map((participant) => participant.country_id));

  return (
    <AppShell>
      <PageHeader
        eyebrow={edition.published ? "Published edition" : "Edition"}
        title={`${editionLabel(edition)} · ${edition.name}`}
        description={
          edition.description ??
          [edition.host_city, edition.year].filter(Boolean).join(" · ")
        }
        actions={
          <Link
            to="/editions"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            ← All editions
          </Link>
        }
      />

      <Panel className="mb-5">
        <div className="grid grid-cols-3 gap-5">
          <StatTile label="Shows" value={shows?.length ?? 0} />
          <StatTile label="Countries" value={nationIds.size} />
          <StatTile label="Entries" value={participants?.length ?? 0} />
        </div>
      </Panel>

      <Panel title="Shows">
        {(shows ?? []).length ? (
          <div className="divide-y divide-border/60">
            {(shows ?? []).map((show) => {
              const line = (participants ?? []).filter(
                (participant) => participant.show_id === show.id,
              );

              return (
                <Link
                  key={show.id}
                  to="/shows/$showId"
                  params={{ showId: show.id }}
                  className="block py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold">{show.name}</h2>
                      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {show.kind.replace("-", " ")} · {line.length} entries
                      </p>
                    </div>
                    <span className="text-xs text-primary">Open →</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {line.slice(0, 18).map((participant) => {
                      const country = countryMap.get(participant.country_id);
                      return country ? (
                        <FlagChip
                          key={participant.id}
                          code={country.short_code}
                          color={country.accent_color}
                          image={country.flag_image}
                          size="sm"
                        />
                      ) : null;
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No shows yet.</p>
        )}
      </Panel>
    </AppShell>
  );
}
