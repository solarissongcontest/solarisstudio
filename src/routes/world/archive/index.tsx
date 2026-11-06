import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldHistoryArchive } from "@/components/world/WorldHistoryArchive";

export const Route = createFileRoute("/world/archive/")({
  validateSearch: (query: Record<string, unknown>) => ({
    code: typeof query.code === "string" && /^[a-z0-9-]{2,12}$/i.test(query.code)
      ? query.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "World Archive — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Explore Terra Solaris history with clearly identified institutional, domestic and editorial provenance." },
    ],
  }),
  component: WorldArchiveRoute,
});

function WorldArchiveRoute() {
  const { code } = Route.useSearch();
  return <WorldPublicGate verifyOnMount><AppShell><WorldHistoryArchive countryCode={code ?? null} /></AppShell></WorldPublicGate>;
}
