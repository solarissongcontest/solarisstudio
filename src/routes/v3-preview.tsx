import { createFileRoute, redirect } from "@tanstack/react-router";

import { V3FoundationPreview } from "@/components/v3/V3FoundationPreview";

export const Route = createFileRoute("/v3-preview")({
  beforeLoad: () => {
    const enabled = !import.meta.env.PROD || import.meta.env.VITE_SOLARIS_V3_PREVIEW === "1";
    if (!enabled) throw redirect({ to: "/", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Solaris Studio V3 Foundation Preview" },
      { name: "robots", content: "noindex,nofollow" },
      {
        name: "description",
        content: "Private visual foundation preview for the next-generation Solaris Studio app experience.",
      },
    ],
  }),
  component: V3FoundationPreview,
});
