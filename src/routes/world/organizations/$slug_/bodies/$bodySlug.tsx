import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldBodyDetails } from "@/components/world/WorldBodiesPublic";

export const Route = createFileRoute("/world/organizations/$slug/bodies/$bodySlug")({
  head: () => ({
    meta: [
      { title: "Institutional body - Terra Solaris" },
      { name: "description", content: "Published identity and status of a Terra Solaris institutional body." },
    ],
  }),
  component: BodyPage,
});

function BodyPage() {
  const { slug, bodySlug } = Route.useParams();
  return <WorldPublicGate><WorldBodyDetails slug={slug} bodySlug={bodySlug} /></WorldPublicGate>;
}
