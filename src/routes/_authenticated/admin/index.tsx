import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminIndexRedirect,
});

function AdminIndexRedirect() {
  return <Navigate to="/admin/operations" replace />;
}
