import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldBodiesDirectory } from "@/components/world/WorldBodiesPublic";

export const Route = createFileRoute("/world/organizations/$slug_/bodies/")({
  head: () => ({
    meta: [
      { title: "Institutional bodies - Terra Solaris" },
      { name: "description", content: "Published assemblies and committees of Terra Solaris." },
    ],
  }),
  component: BodiesPage,
});

function BodiesPage() {
  const { slug } = Route.useParams();
  return <WorldPublicGate verifyOnMount><WorldBodiesDirectory key={slug} slug={slug} /></WorldPublicGate>;
}
