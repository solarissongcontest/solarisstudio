import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldDomesticPolitics } from "@/components/world/WorldDomesticPolitics";

export const Route = createFileRoute("/world/domestic/$code")({
  head: ({ params }) => ({
    meta: [
      { title: params.code.toUpperCase() + " — Domestic politics — Terra Solaris" },
      { name: "description", content: "Published national governments, parties and domestic political history in Terra Solaris." },
    ],
  }),
  component: DomesticPoliticsRoute,
});

function DomesticPoliticsRoute() {
  const { code } = Route.useParams();
  return <WorldPublicGate verifyOnMount><AppShell><WorldDomesticPolitics code={code} /></AppShell></WorldPublicGate>;
}
