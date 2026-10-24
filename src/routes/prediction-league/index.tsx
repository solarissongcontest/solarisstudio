import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { PredictionWorkspaceHeader } from "@/components/predictions/PredictionWorkspaceHeader";
import { PublicResponsiveDataView, type PublicDataColumn } from "@/components/public/PublicResponsiveDataView";
import { Button } from "@/components/ui/button";
import { editionLabel, useEditions } from "@/lib/data";
import {
  useV3PredictionLeagueEnabled,
  useV3PredictionLeagueStandings,
  type V3PredictionStanding,
} from "@/lib/v3-predictions-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/prediction-league/")({
  head: () => ({
    meta: [
      { title: "Prediction League — Solaris Studio" },
      { name: "description", content: "Scored SSC predictions and privacy-safe public standings." },
    ],
  }),
  component: PredictionLeaguePage,
});

const standingColumns: readonly PublicDataColumn<V3PredictionStanding>[] = [
  {
    key: "position",
    header: "#",
    mobileLabel: "Position",
    render: (row) => <span className="tabular-nums">{row.position}</span>,
  },
  {
    key: "player",
    header: "Player",
    primary: true,
    render: (row) => row.displayName,
  },
  {
    key: "score",
    header: "Score",
    align: "right",
    render: (row) => <span className="tabular-nums">{row.score.toFixed(1)}</span>,
  },
  {
    key: "rounds",
    header: "Rounds",
    align: "right",
    render: (row) => <span className="tabular-nums">{row.rounds}</span>,
  },
];

function PredictionLeaguePage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-10" data-v3-prediction-league-cutover="resolving">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
          Prediction League
        </h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          Opening Predictions…
        </p>
      </main>
    );
  }

  if (isAppMode && !rollout.isError && rollout.data?.enabled === true) {
    return <Navigate to="/predictions" replace />;
  }

  return <LegacyPredictionLeaguePage />;
}

function LegacyPredictionLeaguePage() {
  const { data: editions = [] } = useEditions();
  const published = editions.filter((edition) => edition.published);
  const [editionId, setEditionId] = useState<string>("all");
  const feature = useV3PredictionLeagueEnabled(true);
  const standings = useV3PredictionLeagueStandings(
    feature.data === true,
    editionId === "all" ? null : editionId,
  );

  return (
    <AppShell>
      <PredictionWorkspaceHeader
        active="league"
        title="Prediction League"
        description="Objective scoring from published outcomes. Predictions lock on server time, and only people who opt into a public profile appear here."
      />

      {feature.isLoading ? (
        <Panel><p className="text-sm text-muted-foreground" role="status">Checking league rollout…</p></Panel>
      ) : feature.isError ? (
        <Panel title="Prediction League is temporarily unavailable">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground" role="alert">
              Solaris could not verify whether the public league is available. This is a service/read failure, not proof that the league is disabled.
            </p>
            <Button type="button" variant="outline" onClick={() => void feature.refetch()}>
              Retry availability check
            </Button>
          </div>
        </Panel>
      ) : feature.data !== true ? (
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
              <p className="text-sm text-muted-foreground" role="status">Loading scored predictions…</p>
            ) : standings.isError ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm text-destructive">The standings could not be loaded. Your edition filter is preserved.</p>
                <Button type="button" variant="outline" onClick={() => void standings.refetch()}>
                  Retry standings
                </Button>
              </div>
            ) : standings.data?.length ? (
              <PublicResponsiveDataView
                rows={standings.data}
                columns={standingColumns}
                rowKey={(row) => row.profileId}
                ariaLabel="Prediction League standings"
              />
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
