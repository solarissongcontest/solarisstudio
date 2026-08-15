import { createFileRoute } from "@tanstack/react-router";

import { Route as EditionFeatureRoute } from "@/features/admin/edition/AdminEditionRoute";

const featureOptions = EditionFeatureRoute.options as any;

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  component: featureOptions.component,
  head: featureOptions.head,
});
