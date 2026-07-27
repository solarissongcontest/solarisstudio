import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { Scoreboard } from "@/components/Scoreboard";
import { computeStandings } from "@/lib/analysis";
import { useCountries, useEdition, useJuryVotes, useParticipants, useTelevotes } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editions/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.toUpperCase()} scoreboard — Solaris Scoreboard Studio` },
      {
        name: "description",
        content:
          "Full jury and televote scoreboard, running order and country-by-country voting breakdown for this Solaris Song Contest edition.",
      },
      { property: "og:title", content: "SSC edition scoreboard — Solaris Scoreboard Studio" },
      {
        property: "og:description",
        content: "Jury and televote results, running order and voting breakdown for this SSC edition.",
      },
    ],
  }),
  component: EditionPage,
});

const TABS = ["Scoreboard", "Running order", "Jury vs televote", "Voting matrix"] as const;

function EditionPage() {
  const { slug } = Route.useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Scoreboard");
  const { data: edition, isLoading } = useEdition(slug);
  const { data: countries } = useCountries();
  const { data: participants } = useParticipants(edition?.id);
  const { data: jury } = useJuryVotes(edition?.id);
  const { data: tele } = useTelevotes(edition?.id);

  const cMap = new Map((countries ?? []).map((c) => [c.id, c]));
  const participantIds = (participants ?? []).map((p) => p.country_id);
  const standings = computeStandings(participantIds, jury ?? [], tele ?? []);
  const winner = standings[0] ? cMap.get(standings[0].countryId) : undefined;

  if (!isLoading && !edition) {
    return (
      <AppShell>
        <PageHeader title="Edition not found" description="This contest edition does not exist." />
        <Link to="/editions" className="text-primary hover:underline">
          ← Back to editions
        </Link>
      </AppShell>
    );
  }

  const chartData = standings.map((s) => ({
    name: cMap.get(s.countryId)?.short_code ?? "",
    Jury: s.jury,
    Televote: s.televote,
  }));

  return (
    <AppShell>
      <PageHeader
        eyebrow={edition ? `${edition.year} · ${edition.host_city ?? ""}` : ""}
        title={edition?.name ?? "Loading…"}
        description={`${participantIds.length} delegations · ${(jury ?? []).length} jury point awards · split ${edition?.jury_weight ?? 50}/${100 - (edition?.jury_weight ?? 50)}`}
        actions={
          edition && (
            <>
              <Link
                to="/broadcast/$slug"
                params={{ slug: edition.slug }}
                className="bg-aurora rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Broadcast mode
              </Link>
              <Link
                to="/admin/$slug"
                params={{ slug: edition.slug }}
                className="glass rounded-xl px-4 py-2 text-sm font-semibold"
              >
                Manage
              </Link>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Winner" value={winner?.name ?? "—"} hint={`${standings[0]?.total ?? 0} points`} />
        <StatTile label="Delegations" value={participantIds.length} />
        <StatTile
          label="Jury points"
          value={(jury ?? []).reduce((a, v) => a + v.points, 0)}
          hint="Awarded by national juries"
        />
        <StatTile
          label="Televote points"
          value={(tele ?? []).reduce((a, v) => a + v.points, 0)}
          hint="Awarded by Terra Solaris viewers"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm transition-colors",
              tab === t ? "bg-surface-strong text-foreground" : "text-muted-foreground hover:bg-surface",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Scoreboard" && (
          <Panel title="Final scoreboard" description="Jury and televote combined">
            <Scoreboard standings={standings} countries={cMap} />
          </Panel>
        )}

        {tab === "Running order" && (
          <Panel title="Running order" description="Artists and songs in performance order">
            <ul className="divide-y divide-border">
              {(participants ?? []).map((p) => {
                const c = cMap.get(p.country_id);
                if (!c) return null;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span className="numeric w-7 text-muted-foreground">{p.running_order}</span>
                    <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} />
                    <span className="min-w-0 flex-1">
                      <Link
                        to="/countries/$code"
                        params={{ code: c.short_code }}
                        className="block truncate text-sm font-medium hover:text-primary"
                      >
                        {c.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.artist} — “{p.song}”
                      </span>
                    </span>
                    <span className="numeric text-sm font-semibold">
                      {standings.find((s) => s.countryId === c.id)?.total ?? 0}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}

        {tab === "Jury vs televote" && (
          <Panel title="Jury vs televote" description="Where the juries and the public disagreed">
            <div className="h-[420px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Jury" fill="var(--jury)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Televote" fill="var(--televote)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}

        {tab === "Voting matrix" && (
          <Panel
            title="Jury voting matrix"
            description="Rows give points, columns receive them. 12-point awards are highlighted."
          >
            <VotingMatrix
              countries={participantIds.map((id) => cMap.get(id)!).filter(Boolean)}
              jury={jury ?? []}
            />
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

function VotingMatrix({
  countries,
  jury,
}: {
  countries: { id: string; short_code: string; name: string; accent_color: string }[];
  jury: { voter_country_id: string; receiving_country_id: string; points: number }[];
}) {
  const key = (a: string, b: string) => `${a}>${b}`;
  const map = new Map(jury.map((v) => [key(v.voter_country_id, v.receiving_country_id), v.points]));
  const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="scroll-slim overflow-x-auto">
      <table className="numeric min-w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background/80 p-1 text-left font-medium text-muted-foreground">
              from ↓ / to →
            </th>
            {sorted.map((c) => (
              <th key={c.id} className="p-1 font-medium text-muted-foreground">
                {c.short_code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((from) => (
            <tr key={from.id}>
              <th className="sticky left-0 z-10 bg-background/80 p-1 text-left font-medium">
                {from.short_code}
              </th>
              {sorted.map((to) => {
                const pts = from.id === to.id ? null : (map.get(key(from.id, to.id)) ?? 0);
                return (
                  <td
                    key={to.id}
                    className={cn(
                      "h-8 w-8 rounded text-center",
                      pts === null && "bg-surface/40 text-muted-foreground",
                      pts === 12 && "bg-aurora font-bold text-primary-foreground",
                      pts === 10 && "bg-primary/30 font-semibold",
                      pts !== null && pts > 0 && pts < 10 && "bg-surface-strong",
                      pts === 0 && "bg-surface/40 text-muted-foreground/40",
                    )}
                  >
                    {pts === null ? "—" : pts || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
