import { createFileRoute } from "@tanstack/react-router";
import { ImageIcon, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { JuryShareEditionThemeEditor } from "@/components/admin/JuryShareEditionThemeEditor";
import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminEmptyState, AdminStatus } from "@/components/admin/AdminUI";
import { editionLabel, useEditions, useThemes } from "@/lib/data";
import { resolveTheme } from "@/lib/theme";
import {
  createOrganizerJuryShareComposition,
  type OrganizerJuryShareComposition,
} from "@/lib/v3-organizer-jury-share-theme";

export const Route = createFileRoute("/_authenticated/admin/design/$slug/share-graphics")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Share graphics — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JuryShareEditionThemeRoute,
});

type ShareGraphicsEdition = {
  id: string;
  slug: string;
  name?: string | null;
  edition_number?: number | null;
  theme_id?: string | null;
  artwork_url?: string | null;
  artwork_storage_path?: string | null;
};

function JuryShareEditionThemeRoute() {
  const { slug } = Route.useParams();
  const { editionId: organizerEditionId, editionLabel: organizerEditionLabel } = useAdminContext();
  const editionsQuery = useEditions();
  const themesQuery = useThemes();

  const editions = editionsQuery.data ?? [];
  const themes = themesQuery.data ?? [];
  const edition = useMemo(
    () => editions.find((candidate) => candidate.slug === slug) as ShareGraphicsEdition | undefined,
    [editions, slug],
  );

  const exactContext = Boolean(edition && organizerEditionId && edition.id === organizerEditionId);
  const themeRow = useMemo(
    () => (edition?.theme_id ? themes.find((candidate) => candidate.id === edition.theme_id) ?? null : null),
    [edition?.theme_id, themes],
  );
  const theme = useMemo(() => resolveTheme(themeRow?.config), [themeRow?.config]);
  const artworkAssetId = edition?.artwork_storage_path ?? null;
  const artworkUrl = edition?.artwork_url ?? null;

  const initialComposition = useMemo(
    () => createOrganizerJuryShareComposition({ artworkAssetId }),
    [edition?.id, artworkAssetId],
  );
  const [composition, setComposition] = useState<OrganizerJuryShareComposition>(initialComposition);

  useEffect(() => {
    setComposition(initialComposition);
  }, [initialComposition]);

  if (editionsQuery.isLoading || themesQuery.isLoading) {
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
          description="Share graphics only load from an exact Organizer edition route. Select an edition and reopen its Design workspace."
        />
      </AdminPage>
    );
  }

  if (!exactContext) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={LockKeyhole}
          title="Edition context mismatch"
          description={`This Share graphics route belongs to ${editionLabel(edition as never)}, while Organizer is scoped to ${organizerEditionLabel ?? "another edition"}. No edition branding data is editable until route and Organizer context match.`}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="space-y-4">
        <AdminCard className="border-amber-200/15 bg-amber-200/[0.035]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">JSC-8 editor is active; canonical save is intentionally gated</p>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                This workspace can compose and validate the Edition design without reading hidden jury votes. Draft persistence, versioning and Ready/archive transitions stay disabled until the JSC-7 System authority is available on current main. Solaris will not invent browser-owned publication state merely to make a button exist.
              </p>
            </div>
            <AdminStatus tone="attention">System contract required</AdminStatus>
          </div>
        </AdminCard>

        <JuryShareEditionThemeEditor
          editionLabel={editionLabel(edition as never)}
          composition={composition}
          state="unconfigured"
          version={1}
          artworkUrl={artworkUrl}
          accentColor={theme.colors.primary}
          backgroundColor={theme.background.color || theme.background.gradientFrom}
          canManage
          onChange={setComposition}
        />
      </div>
    </AdminPage>
  );
}
