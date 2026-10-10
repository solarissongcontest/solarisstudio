import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/control-room-v2")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminControlRoomV2Redirect,
});

function AdminControlRoomV2Redirect() {
  return <Navigate to="/admin/control-room" replace />;
}
