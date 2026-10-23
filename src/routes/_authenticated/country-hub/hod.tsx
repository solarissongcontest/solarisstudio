import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/hod")({
  head: () => ({
    meta: [
      { title: "Delegation workspace — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: NAV_TARGETS.participate, replace: true });
  },
  component: () => null,
});
