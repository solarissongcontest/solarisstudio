import { createFileRoute, Link } from "@tanstack/react-router";

import { Route as EditionFeatureRoute } from "@/features/admin/edition/AdminEditionRoute";

const featureOptions = EditionFeatureRoute.options as any;
const AdminEditionComponent = featureOptions.component;
const editionHead = featureOptions.head;

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  component: AdminEditionWithArtworkTheme,
  head: editionHead,
});

function AdminEditionWithArtworkTheme() {
  const { slug } = Route.useParams();
  return (
    <>
      <div className="fixed bottom-5 right-5 z-[210] hidden lg:block">
        <Link
          to="/admin/edition-theme/$slug"
          params={{ slug }}
          className="inline-flex min-h-11 items-center rounded-xl border border-primary/25 bg-popover/95 px-4 text-xs font-bold text-primary shadow-2xl backdrop-blur-xl"
        >
          Artwork & colour intelligence →
        </Link>
      </div>
      <AdminEditionComponent />
    </>
  );
}
