import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useFanSession } from "@/lib/prediction-data";
import { resolveV3ResultsAnalysisReveal } from "@/lib/v3-results-analysis-reveal";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";

/**
 * Browser-web equivalent of the installed-app Results analysis reveal.
 *
 * Render either the safe editorial placeholder or the real legacy analytics
 * tree. Never hide spoilers with CSS: a hidden DOM subtree would still expose
 * standings to screen readers and browser indexing.
 *
 * Reuses the existing cached fan-session and notification-preference hooks;
 * neither a new preference store nor an additional polling path is introduced.
 */
export function PublicResultsAnalysisSpoilerBoundary({
  selectedShowId,
  title,
  children,
}: {
  selectedShowId: string | null;
  title: "Result Lab" | "Broadcast Intelligence";
  children: ReactNode;
}) {
  const { preferences } = useAppExperiencePreferences();
  const session = useFanSession();
  const viewerId = session.data?.id ?? null;
  const notificationPreferences = useNotificationPreferences(viewerId ?? undefined);
  const [revealedResultKey, setRevealedResultKey] = useState<string | null>(null);

  const hideSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: session.isSuccess,
    viewerId,
    serverPending: notificationPreferences.isPending,
    serverError: notificationPreferences.isError,
    serverSpoilerFree: notificationPreferences.data?.spoiler_free ?? null,
  });
  const gate = resolveV3ResultsAnalysisReveal({
    hideSpoilers,
    selectedShowId,
    viewerId,
    revealedResultKey,
  });

  if (!gate.protected) return <>{children}</>;

  const replay = title === "Broadcast Intelligence";
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-9" data-v3-public-analysis-web-spoiler-protected="">
        <PageHeader
          eyebrow="Spoiler-free"
          title={title}
          description="Published results are available, but spoiler-free mode is on."
        />
        <Panel title={replay ? "Voting replay hidden" : "Simulation hidden"}>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            {replay
              ? "Replaying this show can reveal the winner, placements and points."
              : "This simulation can reveal the official winner and final rankings."}
            {" "}Reveal this show deliberately to continue without changing your spoiler-free preference.
          </p>
          <button
            type="button"
            onClick={() => setRevealedResultKey(gate.revealKey)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Eye className="size-4" aria-hidden="true" />
            {replay ? "Reveal this replay" : "Reveal this simulation"}
          </button>
        </Panel>
      </div>
    </AppShell>
  );
}
