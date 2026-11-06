import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Preserve the canonical Terra Solaris subsection deep link without creating
 * a second institutional read model or bypassing WorldPublicGate.
 * The parent organization route owns the actual publication-safe projection.
 */
export const Route = createFileRoute("/world/organizations/$slug_/leadership")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/world/organizations/$slug",
      params: { slug: params.slug },
      search: { tab: "leadership" },
      replace: true,
    });
  },
});
