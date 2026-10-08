import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/action-center")({
  component: ActionCenterRedirect,
});

function ActionCenterRedirect() {
  return <Navigate to="/admin/tasks" search={{ filter: "all" }} replace />;
}
