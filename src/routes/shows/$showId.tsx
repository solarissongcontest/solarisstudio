import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { ScoreboardStage } from "@/components/ScoreboardStage";
import { VotingMatrix } from "@/components/VotingMatrix";
import { computeStandings } from "@/lib/analysis";
import {
  useCountries,
  useJuryVotes,
  useShow,
  useShowParticipants,
  useTelevotes,
  useThemes,
} from "@/lib/data";
import { resolveTheme } from "@/lib/theme";
import { resolveVoting } from "@/lib/voting";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shows/$showId")({
  head: () => ({
    meta: [
      { title: "Show results — Solaris Spectacle Suite" },
      { name: "description", content: "Full scoreboard, jury and televote split and voting matrix for this Solaris Song Contest show." },
      { property: "og:title", content: "SSC show results" },
      { property: "og:description", content: "Scoreboard, split results and the full voting matrix." },
    ],
  }),
  component: ShowPage,
});

const TABS = ["Scoreboard", "Split", "Matrix", "Line-up"] as const;

function ShowPage() {
  const { showId } = Route.useParams();
  const { data: show, isLoading } = useShow(showId);
  const { data: participants } = useShowParticipants(showId);
  const { data: jury } = useJuryVotes(showId);
  const { data: tele } = useTelevotes(showId);
  const { data: countries } = useCountries();
  const { data: themes } = useThemes();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Scoreboard");

  const theme = useMemo(
    () => resolveTheme((themes ?? []).find((t) => t.id === show?.theme_id)?.config),
    [themes, show?.theme_id],
  );
  const voting = useMemo(() => resolveVoting(show?.voting_config), [show?.voting_config]);

  const countryMap = new Map((countries ?? []).map((c) => [c.id, c]));
  const participantMap = new Map((participants ?? []).map((p) => [p.country_id, p]));
  const ids = (participants ?? []).map((p) => p.country_id);
  const standings = computeStandings(ids, jury ?? [], tele ?? [], voting);

  if (isLoading) return <AppShell><p className="text-sm text-muted-foreground">Loading show…</p></AppShell>;
  if (!show)
    return (
      <AppShell>
        <PageHeader title="Show unavailable" description="This show is private or does not exist yet." />
        <Link to="/editions" className="text-sm text-primary">← All editions</Link>
      </AppShell>
    );

  const winner = standings[0] ? countryMap.get(standings[0].countryId) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={show.kind.replace("-", " ")}
        title={show.name}
        description={winner ? `Winner: ${winner.name} with ${standings[0].total} points.` : "No results yet."}
        actions={
          <>
            <Link
              to="/broadcast/$showId"
              params={{ showId: show.id }}
              className="bg-aurora rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Watch broadcast
            </Link>
            <Link to="/editions" className="rounded-lg border border-border px-4 py-2 text-sm">
              Editions
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Entries" value={ids.length} />
        <StatTile label="Jury points" value={(jury ?? []).reduce((a, v) => a + v.points, 0)} />
        <StatTile label="Televote points" value={(tele ?? []).reduce((a, v) => a + v.points, 0)} />
        <StatTile label="Qualifiers" value={show.qualifier_count ?? "—"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              tab === t ? "bg-surface-strong" : "text-muted-foreground hover:bg-surface",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Scoreboard" && (
        <ScoreboardStage
          theme={theme}
          standings={standings}
          countries={countryMap}
          participants={participantMap}
          qualifiers={show.qualifier_count}
        />
      )}

      {tab === "Split" && (
        <Panel title="Jury vs televote">
          <ul className="space-y-2">
            {standings.map((r) => {
              const c = countryMap.get(r.countryId);
              const max = Math.max(1, ...standings.map((s) => Math.max(s.jury, s.televote)));
              return (
                <li key={r.countryId} className="glass px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{c?.name}</span>
                    <span className="numeric font-semibold">{r.total}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="h-2 rounded-full bg-[var(--jury)]" style={{ width: `${(r.jury / max) * 50}%` }} />
                    <div
                      className="h-2 rounded-full bg-[var(--televote)]"
                      style={{ width: `${(r.televote / max) * 50}%` }}
                    />
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                    <span className="numeric text-[var(--jury)]">Jury {r.jury}</span>
                    <span className="numeric text-[var(--televote)]">Televote {r.televote}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {tab === "Matrix" && (
        <Panel title="Voting matrix" description="Rows receive, columns give. Hover any cell for the full exchange.">
          <VotingMatrix
            votes={jury ?? []}
            countries={countryMap}
            order={ids}
            topPoint={voting.juryPoints[0] ?? 12}
          />
        </Panel>
      )}

      {tab === "Line-up" && (
        <Panel title="Running order">
          <ol className="space-y-1.5">
            {(participants ?? []).map((p) => {
              const c = countryMap.get(p.country_id);
              return (
                <li key={p.id} className="glass flex items-center gap-3 px-3 py-2">
                  <span className="numeric w-6 text-center text-sm text-muted-foreground">{p.running_order ?? "–"}</span>
                  {c?.flag_image ? (
                    <img src={c.flag_image} alt={c.name} className="h-6 w-9 rounded object-cover" />
                  ) : null}
                  <span className="flex-1 truncate">
                    <span className="font-medium">{c?.name}</span>
                    {(p.artist || p.song) && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {[p.artist, p.song].filter(Boolean).join(" — ")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      )}
    </AppShell>
  );
}
