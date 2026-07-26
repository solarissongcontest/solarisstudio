import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { regionalBias, relationships, votingClusters, votingSimilarity } from "@/lib/analysis";
import { useAllJuryVotes, useCountries } from "@/lib/data";

export const Route = createFileRoute("/analysis/")({
  head: () => ({
    meta: [
      { title: "Voting pattern analysis — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Alliances, voting similarity, clusters, one-sided relationships, 12-point exchanges and regional bias across Terra Solaris.",
      },
      { property: "og:title", content: "Voting pattern analysis — Solaris Scoreboard Studio" },
      {
        property: "og:description",
        content: "Alliances, similarity scores, clusters and regional bias across the Solaris Song Contest.",
      },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const { data: countries } = useCountries();
  const { data: jury } = useAllJuryVotes();
  const cs = countries ?? [];
  const votes = jury ?? [];
  const cMap = new Map(cs.map((c) => [c.id, c]));

  const sims = votingSimilarity(votes, cs).slice(0, 8);
  const { friendships, oneSided } = relationships(votes);
  const clusters = votingClusters(votes, cs, 0.62);
  const bias = regionalBias(votes, cs).slice(0, 6);
  const twelves = votes
    .filter((v) => v.points === 12)
    .map((v) => ({ from: cMap.get(v.voter_country_id), to: cMap.get(v.receiving_country_id) }))
    .filter((x) => x.from && x.to);

  const label = (id: string) => cMap.get(id)?.name ?? "?";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Intelligence"
        title="Voting pattern analysis"
        description="Alliance detection, similarity scoring and bias analysis computed from every jury vote in Terra Solaris history."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Voting similarity" description="Cosine similarity of outgoing voting vectors">
          <ul className="space-y-2">
            {sims.map((s, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                <span className="flex-1 text-sm">
                  {label(s.a)} <span className="text-muted-foreground">&</span> {label(s.b)}
                </span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-background">
                  <span className="bg-aurora block h-full" style={{ width: `${s.score * 100}%` }} />
                </span>
                <span className="numeric w-14 text-right text-sm font-semibold">
                  {(s.score * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Alliances & friendships" description="Strong mutual point exchanges">
          <ul className="space-y-2">
            {friendships.slice(0, 8).map((f, i) => (
              <li key={i} className="rounded-xl bg-surface px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    {label(f.a)} ↔ {label(f.b)}
                  </span>
                  <span className="numeric font-semibold">{f.total} pts</span>
                </div>
                <p className="numeric mt-1 text-xs text-muted-foreground">
                  {label(f.a)} → {f.ab} · {label(f.b)} → {f.ba}
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="One-sided relationships" description="Support that is rarely returned">
          <ul className="space-y-2">
            {oneSided.slice(0, 8).map((o, i) => (
              <li key={i} className="rounded-xl bg-surface px-3 py-2 text-sm">
                <span className="font-medium">{label(o.a)}</span> frequently supports{" "}
                <span className="font-medium">{label(o.b)}</span>, but gets little back.
                <p className="numeric mt-1 text-xs text-muted-foreground">
                  {o.ab} given vs {o.ba} received · gap {o.gap}
                </p>
              </li>
            ))}
            {!oneSided.length && <p className="text-sm text-muted-foreground">No lopsided pairs detected.</p>}
          </ul>
        </Panel>

        <Panel title="Voting clusters" description="Groups voting in similar patterns">
          <div className="space-y-3">
            {clusters.map((group, i) => (
              <div key={i} className="rounded-xl bg-surface p-3">
                <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  Cluster {i + 1}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.map((id) => {
                    const c = cMap.get(id)!;
                    return (
                      <span key={id} className="flex items-center gap-2 rounded-lg bg-background/50 px-2 py-1 text-xs">
                        <FlagChip code={c.short_code} color={c.accent_color} size="sm" />
                        {c.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
            {!clusters.length && <p className="text-sm text-muted-foreground">No clusters above threshold.</p>}
          </div>
        </Panel>

        <Panel title="Regional bias" description="Share of points kept inside a country's own region">
          <ul className="space-y-2">
            {bias.map((b) => {
              const c = cMap.get(b.id);
              if (!c) return null;
              return (
                <li key={b.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                  <FlagChip code={c.short_code} color={c.accent_color} size="sm" />
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="numeric text-sm font-semibold">{(b.share * 100).toFixed(0)}%</span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="12-point exchange map" description="Every maximum award, giver → receiver">
          <div className="scroll-slim max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
            {twelves.map((t, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
                <FlagChip code={t.from!.short_code} color={t.from!.accent_color} size="sm" />
                <span className="text-muted-foreground">gives 12 to</span>
                <FlagChip code={t.to!.short_code} color={t.to!.accent_color} size="sm" />
                <span className="flex-1 truncate">{t.to!.name}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
