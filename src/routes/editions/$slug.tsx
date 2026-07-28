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
    meta: [
      { title: `Edition ${params.slug} — Solaris Spectacle Suite` },
      { name: "description", content: `Shows, line-up and results for Solaris Song Contest edition ${params.slug}.` },
      { property: "og:title", content: `SSC ${params.slug}` },
      { property: "og:description", content: "Shows, line-up and results for this Solaris Song Contest edition." },
    ],
  }),
  component: EditionPage,
});

function EditionPage() {
  const { slug } = Route.useParams();
  const { data: edition, isLoading } = useEdition(slug);
  const { data: shows } = useShows(edition?.id);
  const { data: participants } = useParticipants(edition?.id);
  const { data: countries } = useCountries();
  const countryMap = new Map((countries ?? []).map((c) => [c.id, c]));

  if (isLoading) return <AppShell><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  if (!edition)
    return (
      <AppShell>
        <PageHeader title="Edition not found" description="This edition may be private or may not exist." />
        <Link to="/editions" className="text-sm text-primary">← All editions</Link>
      </AppShell>
    );

  const nations = new Set((participants ?? []).map((p) => p.country_id));

  return (
    <AppShell>
      <PageHeader
        eyebrow={edition.published ? "Public edition" : "Private edition"}
        title={`${editionLabel(edition)} — ${edition.name}`}
        description={
          edition.description ??
          [edition.host_city, edition.year ? String(edition.year) : null].filter(Boolean).join(" · ")
        }
        actions={
          <Link to="/editions" className="rounded-lg border border-border px-3 py-1.5 text-sm">
            All editions
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Shows" value={shows?.length ?? 0} />
        <StatTile label="Participating nations" value={nations.size} />
        <StatTile label="Entries" value={participants?.length ?? 0} />
      </div>

      <Panel title="Shows" description="Each show has its own line-up, voting rules and broadcast look.">
        {!shows?.length && <p className="text-sm text-muted-foreground">No shows created yet.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {(shows ?? []).map((s) => {
            const line = (participants ?? []).filter((p) => p.show_id === s.id);
            return (
              <li key={s.id}>
                <Link
                  to="/shows/$showId"
                  params={{ showId: s.id }}
                  className="glass block px-4 py-3 transition-colors hover:bg-surface-strong"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{s.name}</span>
                    <span
                      className={
                        s.published
                          ? "rounded-full bg-surface-strong px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary"
                          : "rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                      }
                    >
                      {s.published ? "Published" : "Private"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {s.kind.replace("-", " ")} · {line.length} entries
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {line.slice(0, 14).map((p) => {
                      const c = countryMap.get(p.country_id);
                      return c ? (
                        <FlagChip key={p.id} code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                      ) : null;
                    })}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </AppShell>
  );
}
