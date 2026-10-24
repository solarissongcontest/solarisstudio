import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility route for old bookmarks. Public navigation now lives in the
 * shared sidebar and Rules is one section of that navigation.
 */
export const Route = createFileRoute("/library")({
  beforeLoad: () => {
    throw redirect({ to: "/rules", replace: true });
  },
});
