import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useAllShows, useEditions } from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";

export const Route = createFileRoute("/results/$slug")({
  head: () => ({ meta: [{ title: "Edition results — Solaris Studio" }] }),
  component: LegacyEditionResultsRedirect,
});

function LegacyEditionResultsRedirect() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();

  const target = useMemo(() => {
    const edition = (editionsQuery.data ?? []).find(
      (item) => item.slug.toLowerCase() === slug.toLowerCase(),
    );
    if (!edition) return null;

    const shows = (showsQuery.data ?? [])
      .filter(
        (show) =>
          show.edition_id === edition.id &&
          isShowPublic(show) &&
          resolveShowPublication(show).results,
      )
      .sort((a, b) => {
        const aFinal = a.kind === "grand-final" || a.kind === "final";
        const bFinal = b.kind === "grand-final" || b.kind === "final";
        if (aFinal !== bFinal) return aFinal ? -1 : 1;
        return b.sort_order - a.sort_order;
      });

    return shows[0] ?? null;
  }, [editionsQuery.data, showsQuery.data, slug]);

  useEffect(() => {
    if (target) {
      void navigate({ to: "/shows/$showId", params: { showId: target.id }, replace: true });
    }
  }, [navigate, target]);

  if (editionsQuery.isLoading || showsQuery.isLoading || target) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Opening edition results…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Results"
        title="No published result found"
        description="This old edition-results link is still supported, but there is no public result to open for that edition yet."
      />
      <Panel>
        <Link to="/results" className="text-sm font-semibold text-primary">
          Open Results overview →
        </Link>
      </Panel>
    </AppShell>
  );
}
