import { createFileRoute } from "@tanstack/react-router";
import { WorldLandingPage } from "@/components/v3/V3WorldPublicPages";

export const Route = createFileRoute("/world/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris — Solaris Studio" },
      { name: "description", content: "Explore the public international institutions of Terra Solaris." },
    ],
  }),
  component: WorldLandingPage,
});
