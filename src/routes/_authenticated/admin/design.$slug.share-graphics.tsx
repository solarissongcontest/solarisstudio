import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon, LockKeyhole } from "lucide-react";
import { useMemo } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { JuryShareEditionThemeEditor } from "@/components/admin/JuryShareEditionThemeEditor";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminEmptyState } from "@/components/admin/AdminUI";
import { editionLabel, useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/design/$slug/share-graphics")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Share graphics — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShareGraphicsRoute,
});

type ShareGraphicsEdition = {
  id: string;
  slug: string;
  name?: string | null;
  edition_number?: number | null;
  artwork_url?: string | null;
  artwork_storage_path?: string | null;
};

function ShareGraphicsRoute() {
  const { slug } = Route.useParams();
  const { editionId, editionLabel: contextEditionLabel } = useAdminContext();
  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];
  const edition = useMemo(
    () => editions.find((candidate) => candidate.slug === slug) as ShareGraphicsEdition | undefined,
    [editions, slug],
  );

  if (editionsQuery.isLoading) {
    return (
      <AdminPage>
        <AdminCard>
          <div className="h-4 w-36 animate-pulse rounded bg-white/[0.08]" />
          <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-5 aspect-[9/16] w-full max-w-[18rem] animate-pulse rounded-3xl bg-white/[0.04]" />
        </AdminCard>
      </AdminPage>
    );
  }

  if (!edition) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={ImageIcon}
          title="Edition not found"
          description="Share graphics requires an exact edition route. Select an edition in Organizer and reopen its Design workspace."
        />
      </AdminPage>
    );
  }

  if (!editionId || edition.id !== editionId) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={LockKeyhole}
          title="Edition context mismatch"
          description={`This Share graphics route belongs to ${editionLabel(edition as never)}, while Organizer is scoped to ${contextEditionLabel ?? "another edition"}. Solaris will not substitute a different edition or load a cross-edition theme.`}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <JuryShareEditionThemeEditor
        editionId={edition.id}
        editionLabel={editionLabel(edition as never)}
        artworkStoragePath={edition.artwork_storage_path ?? null}
        artworkUrl={edition.artwork_url ?? null}
        renderValidationReady={false}
        renderValidationSummary="Authoritative renderer validation for the exact saved version is not available yet. Draft editing remains available, but Ready stays fail-closed."
      />
    </AdminPage>
  );
}
