import { createFileRoute } from "@tanstack/react-router";

import { Route as EditionFeatureRoute } from "@/features/admin/edition/AdminEditionRoute";

const featureOptions = EditionFeatureRoute.options as any;
const AdminEditionComponent = featureOptions.component;
const editionHead = featureOptions.head;

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  component: AdminEditionComponent,
  head: editionHead,
});
