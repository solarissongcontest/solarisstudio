import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/status")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminStatusRedirect,
});

function AdminStatusRedirect() {
  return <Navigate to="/admin/sync-health" replace />;
}
