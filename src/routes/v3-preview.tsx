import { createFileRoute } from "@tanstack/react-router";

import { V3FoundationPreview } from "@/components/v3/V3FoundationPreview";

export const Route = createFileRoute("/v3-preview")({
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
