import { createFileRoute, Link } from "@tanstack/react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { computeHeadToHead, computeRelationship } from "@/lib/stats";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/relationships/$pair")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.pair.replace(/-vs-/i, " vs ")} — Country relationship — Solaris Scoreboard Studio` },
      {
        name: "description",
        content: `Voting history, friendship and rivalry scores between ${params.pair.replace(/-vs-/i, " and ")} at the Solaris Song Contest.`,
      },
      { property: "og:title", content: `${params.pair.replace(/-vs-/i, " vs ")} — SSC relationship` },
      { property: "og:description", content: "Full voting history between these two nations." },
    ],
  }),
  component: RelationshipPairPage,
});

function RelationshipPairPage() {
  const { pair } = Route.useParams();
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: participants } = useAllParticipants();
  const { data: jury } = useAllJuryVotes();
  const { data: results } = useAllResults();

  const [codeA, codeB] = pair.toUpperCase().split("-VS-");
  const a = (countries ?? []).find((c) => c.short_code.toUpperCase() === codeA);
  const b = (countries ?? []).find((c) => c.short_code.toUpperCase() === codeB);

  if (!a || !b) {
    return (
      <AppShell>
        <PageHeader title="Relationship not found" description="Check the country codes in the URL." />
        <Link to="/relationships" className="text-sm text-primary hover:underline">
          ← All relationships
        </Link>
      </AppShell>
    );
  }

  const rel = computeRelationship(a.id, b.id, { editions: editions ?? [], jury: jury ?? [], results: results ?? [] });
  const h2h = computeHeadToHead(a.id, b.id, { editions: editions ?? [], results: results ?? [] });

  const editionsByA = new Set((participants ?? []).filter((p) => p.country_id === a.id).map((p) => p.edition_id));
  const sharedEditions = [...new Set((participants ?? []).filter((p) => p.country_id === b.id && editionsByA.has(p.edition_id)).map((p) => p.edition_id))]
    .map((id) => (editions ?? []).find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((x, y) => (y.year ?? 0) - (x.year ?? 0));

  if (!sharedEditions.length) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="No shared history"
          title={`${a.name} vs ${b.name}`}
          description="These two nations have never appeared in the same edition yet."
        />
        <div className="flex gap-3">
          <Link to="/countries/$code" params={{ code: a.short_code }} className="text-sm text-primary hover:underline">
            {a.name} profile →
          </Link>
          <Link to="/countries/$code" params={{ code: b.short_code }} className="text-sm text-primary hover:underline">
            {b.name} profile →
          </Link>
        </div>
      </AppShell>
    );
  }

  const chartData = rel.timeline.map((t) => ({
    year: t.year,
    [`${a.short_code} → ${b.short_code}`]: t.aToB,
    [`${b.short_code} → ${a.short_code}`]: t.bToA,
  }));

  const narrative = buildNarrative(a.name, b.name, rel, h2h);

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${sharedEditions.length} shared edition${sharedEditions.length === 1 ? "" : "s"}`}
        title={`${a.name} vs ${b.name}`}
        description="Voting history, friendship and rivalry between these two Terra Solaris delegations."
        actions={
          <Link
            to="/compare"
            search={{ a: a.id, b: b.id } as never}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
          >
            Full comparison →
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link to="/countries/$code" params={{ code: a.short_code }} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 hover:bg-surface-strong">
          <FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="md" />
          <span className="text-sm font-medium">{a.name}</span>
        </Link>
        <span className="text-muted-foreground">vs</span>
        <Link to="/countries/$code" params={{ code: b.short_code }} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 hover:bg-surface-strong">
          <FlagChip code={b.short_code} color={b.accent_color} image={b.flag_image} size="md" />
          <span className="text-sm font-medium">{b.name}</span>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Shared participations" value={rel.participationsTogether} />
        <StatTile label={`${a.short_code} → ${b.short_code}`} value={rel.totalAtoB} hint={`avg ${rel.avgAtoB?.toFixed(1) ?? "—"}`} />
        <StatTile label={`${b.short_code} → ${a.short_code}`} value={rel.totalBtoA} hint={`avg ${rel.avgBtoA?.toFixed(1) ?? "—"}`} />
        <StatTile label="Mutual 12 points" value={rel.mutualTwelves} />
        <StatTile label="Friendship score" value={rel.friendshipScore.toFixed(0)} />
        <StatTile label="Rivalry score" value={rel.rivalryScore.toFixed(0)} />
        <StatTile label="Voting similarity" value={`${(rel.similarity * 100).toFixed(0)}%`} />
        <StatTile
          label="Largest disagreement"
          value={rel.biggestDisagreement ? `${rel.biggestDisagreement.gap} pts` : "—"}
          hint={rel.biggestDisagreement?.year ? `${rel.biggestDisagreement.year}` : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Voting timeline" description="Jury points exchanged, both directions">
          <div className="h-[280px]">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey={`${a.short_code} → ${b.short_code}`} stroke="var(--jury)" strokeWidth={3} dot />
                  <Line type="monotone" dataKey={`${b.short_code} → ${a.short_code}`} stroke="var(--televote)" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No jury votes exchanged between these countries yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Head-to-head" description="Final ranking comparisons in shared editions">
          <ul className="space-y-2">
            <li className="flex justify-between rounded-xl bg-surface px-3 py-2 text-sm">
              <span>{a.name} finished higher</span>
              <span className="numeric font-semibold">{h2h.aWins}</span>
            </li>
            <li className="flex justify-between rounded-xl bg-surface px-3 py-2 text-sm">
              <span>{b.name} finished higher</span>
              <span className="numeric font-semibold">{h2h.bWins}</span>
            </li>
            <li className="flex justify-between rounded-xl bg-surface px-3 py-2 text-sm">
              <span>Ties</span>
              <span className="numeric font-semibold">{h2h.ties}</span>
            </li>
            <li className="flex justify-between rounded-xl bg-surface px-3 py-2 text-sm">
              <span>Average placement gap</span>
              <span className="numeric font-semibold">{h2h.avgDiff != null ? h2h.avgDiff.toFixed(1) : "—"}</span>
            </li>
          </ul>
          {!h2h.rows.length && (
            <p className="mt-2 text-xs text-muted-foreground">Final-ranking results are not recorded for these editions yet.</p>
          )}
        </Panel>

        <Panel title="Historical evolution" description="A narrative summary" className="lg:col-span-2">
          <p className="text-sm leading-relaxed text-muted-foreground">{narrative}</p>
        </Panel>

        <Panel title="Shared editions" description="Every edition where both nations competed" className="lg:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sharedEditions.map((e) => (
              <Link
                key={e.id}
                to="/editions/$slug"
                params={{ slug: e.slug }}
                className="rounded-xl bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-strong"
              >
                {editionLabel(e)} {e.year ? `· ${e.year}` : ""}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function buildNarrative(
  nameA: string,
  nameB: string,
  rel: ReturnType<typeof computeRelationship>,
  h2h: ReturnType<typeof computeHeadToHead>,
) {
  const parts: string[] = [];
  parts.push(
    `${nameA} and ${nameB} have shared ${rel.participationsTogether} edition${rel.participationsTogether === 1 ? "" : "s"} of the Solaris Song Contest.`,
  );
  if (rel.totalAtoB || rel.totalBtoA) {
    parts.push(
      `In jury voting, ${nameA} has awarded ${rel.totalBtoA ? nameB : nameB} ${rel.totalAtoB} point${rel.totalAtoB === 1 ? "" : "s"}, while ${nameB} has returned ${rel.totalBtoA} point${rel.totalBtoA === 1 ? "" : "s"} to ${nameA}.`,
    );
  } else {
    parts.push(`No jury points have been exchanged between the two nations so far.`);
  }
  if (rel.mutualTwelves > 0) {
    parts.push(`They have exchanged douze points mutually ${rel.mutualTwelves} time${rel.mutualTwelves === 1 ? "" : "s"}, a hallmark of a strong alliance.`);
  }
  if (rel.friendshipScore > rel.rivalryScore) {
    parts.push(`Overall, the relationship leans towards friendship (score ${rel.friendshipScore.toFixed(0)} vs rivalry ${rel.rivalryScore.toFixed(0)}).`);
  } else if (rel.rivalryScore > 0) {
    parts.push(`Overall, the relationship leans towards rivalry (score ${rel.rivalryScore.toFixed(0)} vs friendship ${rel.friendshipScore.toFixed(0)}).`);
  }
  if (h2h.rows.length) {
    parts.push(
      `Head-to-head, ${nameA} has finished ahead ${h2h.aWins} time${h2h.aWins === 1 ? "" : "s"} and ${nameB} ${h2h.bWins} time${h2h.bWins === 1 ? "" : "s"}, with ${h2h.ties} tie${h2h.ties === 1 ? "" : "s"}.`,
    );
  }
  return parts.join(" ");
}
