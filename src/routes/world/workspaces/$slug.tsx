import { createFileRoute } from "@tanstack/react-router";
import { WorldPrivateWorkspace } from "@/components/world/WorldPrivateWorkspace";
import { isValidRoomId } from "@/lib/terra-world-private";

export const Route = createFileRoute("/world/workspaces/$slug")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { room?: string } => ({
    room: isValidRoomId(search.room) ? search.room : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Private institutional workspace — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  const { slug } = Route.useParams();
  const { room } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <WorldPrivateWorkspace
    slug={slug} roomId={room}
    onRoomChange={(nextRoom) => void navigate({ search: { room: nextRoom }, replace: true })}
  />;
}
