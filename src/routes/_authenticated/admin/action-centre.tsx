import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/action-centre")({
  component: ActionCentreRedirect,
});

function ActionCentreRedirect() {
  return <Navigate to="/admin/tasks" search={{ filter: "all" }} replace />;
}
