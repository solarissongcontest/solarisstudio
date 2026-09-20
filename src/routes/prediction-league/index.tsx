import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions } from "@/lib/data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/prediction-league/")({
  head: () => ({
    meta: [
      { title: "Prediction League — Solaris Studio" },
      { name: "description", content: "Scored SSC predictions and privacy-safe public standings." },
    ],
  }),
  component: PredictionLeaguePage,
});

type Standing = {
  profileId: string;
  displayName: string;
  score: number;
  rounds: number;
  position: number;
  lastScoredAt: string | null;
};

function PredictionLeaguePage() {
  const { data: editions = [] } = useEditions();
  const published = editions.filter((edition) => edition.published);
  const [editionId, setEditionId] = useState<string>("all");
  const feature = useQuery({
    queryKey: ["studio2-feature", "prediction_league"],
    queryFn: () => isStudio2FeatureEnabled("prediction_league"),
    staleTime: 30_000,
  });
  const standings = useQuery({
    enabled: feature.data === true,
    queryKey: ["prediction-league", editionId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("prediction_league_leaderboard", {
        _edition_id: editionId === "all" ? null : editionId,
      });
      if (error) throw error;
      return (data ?? []) as Standing[];
    },
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Predictions"
        title="Prediction League"
        description="Objective scoring from published outcomes. Predictions lock on server time, and only people who opt into a public profile appear here."
        actions={<Link to="/predictions" className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold">Make predictions →</Link>}
      />

      {feature.isLoading ? (
        <Panel><p className="text-sm text-muted-foreground">Checking league rollout…</p></Panel>
      ) : feature.data === false ? (
        <Panel title="Prediction League is not enabled yet"><p className="text-sm text-muted-foreground">The scoring and leaderboard product is installed but remains behind its rollout flag during verification.</p></Panel>
      ) : (
        <>
          <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Edition
              <select value={editionId} onChange={(event) => setEditionId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground sm:max-w-xs">
                <option value="all">All scored editions</option>
                {published.map((edition) => <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>)}
              </select>
            </label>
          </div>

          <Panel title="Leaderboard" description="Ties share a position. More scored rounds is the first tie-break after total score.">
            {standings.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading scored predictions…</p>
            ) : standings.isError ? (
              <p className="text-sm text-destructive">The standings could not be loaded.</p>
            ) : standings.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="pb-2">#</th><th className="pb-2">Player</th><th className="pb-2">Score</th><th className="pb-2">Rounds</th></tr></thead>
                  <tbody>
                    {standings.data.map((row) => (
                      <tr key={row.profileId} className="border-t border-border/60">
                        <td className="py-3 font-semibold tabular-nums">{row.position}</td>
                        <td className="py-3 font-semibold">{row.displayName}</td>
                        <td className="py-3 tabular-nums">{row.score.toFixed(1)}</td>
                        <td className="py-3 tabular-nums">{row.rounds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No public scored league entries are available for this scope yet.</p>
            )}
          </Panel>

          <Panel title="How scoring stays stable" className="mt-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Each prediction stores its scoring version and is evaluated only against authoritative published results. Historical scores are not silently rewritten when a later scoring model changes. The existing Prediction Arena remains the submission surface; this page is the season and leaderboard layer.
            </p>
          </Panel>
        </>
      )}
    </AppShell>
  );
}
