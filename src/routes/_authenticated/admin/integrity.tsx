import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/integrity")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: AdminIntegrityRedirect,
});

function AdminIntegrityRedirect() {
  return <Navigate to="/admin/integrity-investigations" replace />;
}
