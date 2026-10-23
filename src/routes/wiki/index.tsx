import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * P33 compatibility boundary.
 *
 * Wiki and Encyclopedia both grew into historical/reference directories. V3
 * exposes one canonical Reference index at /encyclopedia while preserving the
 * richer /wiki/$code country-article URLs until their article-level capability
 * has an equivalent canonical destination.
 */
export const Route = createFileRoute("/wiki/")({
  beforeLoad: () => {
    throw redirect({
      to: "/encyclopedia",
      search: {
        kind: "country",
        q: undefined,
        artist: undefined,
      },
      replace: true,
    });
  },
  component: () => null,
});
